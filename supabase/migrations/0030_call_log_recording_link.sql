-- Link each call log to its recording: call_logs.recording_id -> call_recordings.id.
--
-- Calls and recordings sync independently (recordings upload on Wi-Fi only, so usually later),
-- and the phone never learns the server-generated recording id. So the phone sends the identity
-- of the call it matched (matched_call_at, plus the phone_number it already sends) and the
-- database fills recording_id in whichever order the two rows arrive. The app has no update
-- access to call_logs, hence security definer.

alter table call_recordings add column matched_call_at timestamptz;

alter table call_logs add column recording_id uuid references call_recordings on delete set null;
create index call_logs_recording_id_idx on call_logs (recording_id);

-- Recording arrives after (or with) its call: point the call at it.
create function link_recording_to_call() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.matched_call_at is not null and new.phone_number is not null then
    update call_logs
       set recording_id = new.id
     where device_id = new.device_id
       and phone_number = new.phone_number
       and called_at = new.matched_call_at
       and recording_id is null;
  end if;
  return new;
end $$;

create trigger call_recordings_link after insert on call_recordings
  for each row execute function link_recording_to_call();

-- Call arrives after its recording: pick the recording up on insert.
create function link_call_to_recording() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recording_id is null then
    select r.id into new.recording_id
      from call_recordings r
     where r.device_id = new.device_id
       and r.phone_number = new.phone_number
       and r.matched_call_at = new.called_at
     order by r.recorded_at
     limit 1;
  end if;
  return new;
end $$;

create trigger call_logs_link before insert on call_logs
  for each row execute function link_call_to_recording();

-- Backfill anything already synced before this migration (no-op on a fresh database).
update call_logs c
   set recording_id = r.id
  from call_recordings r
 where c.recording_id is null
   and r.matched_call_at is not null
   and r.device_id = c.device_id
   and r.phone_number = c.phone_number
   and r.matched_call_at = c.called_at;
