-- Call log + call recording sync from the staff Android app.
-- Append-only from the phone: rows are inserted, never updated or deleted by the app.
-- Only admins and editors can write or read; phones must sign in as one of those roles.

create type call_type as enum ('inbound', 'outbound', 'missed');
create type call_status as enum ('connected', 'no_answer', 'rejected', 'unknown');

create table call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references profiles on delete set null,
  device_id text not null,
  phone_number text not null,
  phone_e164 text,
  call_type call_type not null,
  call_status call_status not null default 'unknown',
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  called_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Same dedupe key the phone uses locally, so a re-sent batch is ignored.
  unique (device_id, phone_number, call_type, called_at, duration_seconds)
);

create index call_logs_phone_e164_idx on call_logs (phone_e164);
create index call_logs_called_at_idx on call_logs (called_at desc);

create table call_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references profiles on delete set null,
  device_id text not null,
  contact_label text,
  phone_number text,
  phone_e164 text,
  recorded_at timestamptz not null,
  duration_ms bigint check (duration_ms >= 0),
  size_bytes bigint check (size_bytes >= 0),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (device_id, storage_path)
);

create index call_recordings_phone_e164_idx on call_recordings (phone_e164);
create index call_recordings_recorded_at_idx on call_recordings (recorded_at desc);

alter table call_logs enable row level security;
alter table call_recordings enable row level security;

create policy "read call_logs" on call_logs for select to authenticated
  using (current_role_is('admin', 'editor'));
create policy "insert call_logs" on call_logs for insert to authenticated
  with check (current_role_is('admin', 'editor') and user_id = auth.uid());

create policy "read call_recordings" on call_recordings for select to authenticated
  using (current_role_is('admin', 'editor'));
create policy "insert call_recordings" on call_recordings for insert to authenticated
  with check (current_role_is('admin', 'editor') and user_id = auth.uid());

-- Private bucket (recordings are sensitive; the web app plays them via signed URLs).
-- Objects live under {user_id}/{device_id}/{file}, and a phone can only write into its own user folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('call-recordings', 'call-recordings', false, 104857600,
        array['audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/aac', 'audio/amr',
              'audio/3gpp', 'audio/wav', 'audio/x-wav', 'audio/ogg'])
on conflict (id) do nothing;

create policy "call recordings read" on storage.objects for select to authenticated
  using (bucket_id = 'call-recordings' and public.current_role_is('admin', 'editor'));
create policy "call recordings insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'call-recordings'
    and public.current_role_is('admin', 'editor')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
