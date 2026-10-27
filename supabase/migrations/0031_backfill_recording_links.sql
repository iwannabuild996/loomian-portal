-- One-off: link recordings that uploaded without matched_call_at (before 0030 and the matching
-- app build), and so never got call_logs.recording_id.
--
-- Same rule the phone uses: a recording belongs to the call, from the same phone and number,
-- whose end time (called_at + duration) is nearest to the recording time, within 2 minutes.
-- Each call takes at most one recording, and each recording links to at most one call.
-- Anything ambiguous is left alone rather than guessed.

with candidates as (
  select
    r.id as recording_id,
    c.id as call_id,
    r.recorded_at,
    abs(extract(epoch from (r.recorded_at - (c.called_at + make_interval(secs => c.duration_seconds))))) as gap_seconds
  from call_recordings r
  join call_logs c
    on c.device_id = r.device_id
   and (
        (r.phone_number is not null and c.phone_number = r.phone_number)
     or (r.phone_e164 is not null and c.phone_e164 = r.phone_e164)
   )
  where c.recording_id is null
    and not exists (select 1 from call_logs done where done.recording_id = r.id)
    and abs(extract(epoch from (r.recorded_at - (c.called_at + make_interval(secs => c.duration_seconds))))) <= 120
),
-- Each recording keeps only its nearest call...
best_call_per_recording as (
  select distinct on (recording_id) recording_id, call_id, gap_seconds
  from candidates
  order by recording_id, gap_seconds, call_id
),
-- ...and each call keeps only its nearest recording.
best_recording_per_call as (
  select distinct on (call_id) recording_id, call_id
  from best_call_per_recording
  order by call_id, gap_seconds, recording_id
)
update call_logs c
   set recording_id = b.recording_id
  from best_recording_per_call b
 where c.id = b.call_id;
