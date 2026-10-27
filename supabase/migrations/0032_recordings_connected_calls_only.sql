-- A recording can only belong to a connected call. Missed / no-answer / rejected calls have
-- nothing to record, so any link to one was a wrong match (the nearest call in time happened
-- to be a missed one).
--
-- 1. The link triggers (0030) ignore calls that are not connected.
-- 2. Existing links to non-connected calls are cleared.
-- 3. A check constraint keeps it that way.
-- 4. The backfill is re-run, now only against connected calls.

create or replace function link_recording_to_call() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.matched_call_at is not null and new.phone_number is not null then
    update call_logs
       set recording_id = new.id
     where device_id = new.device_id
       and phone_number = new.phone_number
       and called_at = new.matched_call_at
       and call_status = 'connected'
       and recording_id is null;
  end if;
  return new;
end $$;

create or replace function link_call_to_recording() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recording_id is null and new.call_status = 'connected' then
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

update call_logs set recording_id = null
 where recording_id is not null and call_status <> 'connected';

alter table call_logs drop constraint if exists call_logs_recording_only_when_connected;
alter table call_logs add constraint call_logs_recording_only_when_connected
  check (recording_id is null or call_status = 'connected');

-- Re-link: nearest connected call (same phone and number) whose end time is within 2 minutes
-- of the recording. One recording per call, one call per recording; ambiguity is left unlinked.
with candidates as (
  select
    r.id as recording_id,
    c.id as call_id,
    abs(extract(epoch from (r.recorded_at - (c.called_at + make_interval(secs => c.duration_seconds))))) as gap_seconds
  from call_recordings r
  join call_logs c
    on c.device_id = r.device_id
   and (
        (r.phone_number is not null and c.phone_number = r.phone_number)
     or (r.phone_e164 is not null and c.phone_e164 = r.phone_e164)
   )
  where c.call_status = 'connected'
    and c.recording_id is null
    and not exists (select 1 from call_logs done where done.recording_id = r.id)
    and abs(extract(epoch from (r.recorded_at - (c.called_at + make_interval(secs => c.duration_seconds))))) <= 120
),
best_call_per_recording as (
  select distinct on (recording_id) recording_id, call_id, gap_seconds
  from candidates
  order by recording_id, gap_seconds, call_id
),
best_recording_per_call as (
  select distinct on (call_id) recording_id, call_id
  from best_call_per_recording
  order by call_id, gap_seconds, recording_id
)
update call_logs c
   set recording_id = b.recording_id
  from best_recording_per_call b
 where c.id = b.call_id;
