-- Meetings: with an existing lead, or with a one-off guest (name + phone) who is not added as a lead.

create type meeting_status as enum ('scheduled', 'completed', 'cancelled');

create table meetings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads on delete cascade,
  guest_name text,
  guest_country_code text check (guest_country_code ~ '^\+[0-9]{1,4}$'),
  guest_number text check (guest_number ~ '^[0-9]{4,14}$'),
  title text,
  location text,
  scheduled_at timestamptz not null,
  status meeting_status not null default 'scheduled',
  notes text,
  created_by uuid default auth.uid() references profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Either a lead, or a custom name and phone.
  check (
    lead_id is not null
    or (nullif(trim(guest_name), '') is not null and guest_country_code is not null and guest_number is not null)
  )
);
create index on meetings (lead_id);
create index on meetings (scheduled_at);

create trigger meetings_touch before update on meetings for each row execute function touch_updated_at();
create trigger meetings_audit after insert or update or delete on meetings for each row execute function write_audit();

alter table meetings enable row level security;
create policy "read meetings" on meetings for select to authenticated using (true);
create policy "write meetings" on meetings for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));
