-- Status history entries can be corrected after the fact, but only their note and date/time:
-- the status itself (from/to) and who changed it stay as recorded.
create policy "update lead_status_log" on lead_status_log for update to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

create function lead_status_log_guard() returns trigger language plpgsql as $$
begin
  if new.lead_id is distinct from old.lead_id
     or new.from_status is distinct from old.from_status
     or new.to_status is distinct from old.to_status
     or new.changed_by is distinct from old.changed_by then
    raise exception 'Only the note and date of a status change can be edited.';
  end if;
  return new;
end $$;
create trigger lead_status_log_guard before update on lead_status_log for each row execute function lead_status_log_guard();
