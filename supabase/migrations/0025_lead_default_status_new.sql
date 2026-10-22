-- New leads must start as "New". The default used to be the lowest sort_order, so any status added in the
-- admin with sort order 0 (the form default) silently became the starting status for every new lead.
create or replace function lead_default_status() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status_id is null then
    select id into new.status_id from lead_statuses where name = 'New';
    if new.status_id is null then
      select id into new.status_id from lead_statuses order by sort_order, name limit 1;
    end if;
  end if;
  return new;
end $$;
