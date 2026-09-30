-- Lead statuses: an ordered master, a status on every lead, and a log of each status change.

create table lead_statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

insert into lead_statuses (name, sort_order) values
  ('New', 1), ('Contacted', 2), ('Callback requested', 3), ('Interested', 4), ('Not interested', 5),
  ('Follow up', 6), ('Invalid', 7), ('Requirement differs', 8), ('Deal closed', 9), ('Rejected', 10),
  ('Site visit', 11);

create trigger lead_statuses_audit after insert or update or delete on lead_statuses for each row execute function write_audit();

-- Every lead has a status; existing leads start as the first status (New).
alter table leads add column status_id uuid references lead_statuses on delete restrict;
update leads set status_id = (select id from lead_statuses order by sort_order limit 1);
alter table leads alter column status_id set not null;
create index on leads (status_id);

-- History of status changes. Names are copied so the log still reads correctly if a status is
-- later renamed or deleted.
create table lead_status_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  changed_by uuid default auth.uid() references profiles on delete set null,
  changed_at timestamptz not null default now()
);
create index on lead_status_log (lead_id, changed_at desc);

-- New leads start as the first status in the master (or whichever the caller set) and get a first log entry.
create function lead_default_status() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status_id is null then
    select id into new.status_id from lead_statuses order by sort_order, name limit 1;
  end if;
  return new;
end $$;
create trigger leads_default_status before insert on leads for each row execute function lead_default_status();

create function lead_initial_status_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into lead_status_log (lead_id, to_status, changed_by)
  select new.id, s.name, new.created_by from lead_statuses s where s.id = new.status_id;
  return null;
end $$;
create trigger leads_initial_status_log after insert on leads for each row execute function lead_initial_status_log();

alter table lead_statuses enable row level security;
alter table lead_status_log enable row level security;

create policy "read lead_statuses" on lead_statuses for select to authenticated using (true);
create policy "write lead_statuses" on lead_statuses for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

create policy "read lead_status_log" on lead_status_log for select to authenticated using (true);
create policy "write lead_status_log" on lead_status_log for insert to authenticated
  with check (current_role_is('admin', 'editor'));

-- Switches a lead to another status and records who did it, when, and an optional note.
create function change_lead_status(p_lead_id uuid, p_status_id uuid, p_note text default null) returns void
language plpgsql set search_path = public as $$
declare
  v_from text;
  v_to text;
  v_current uuid;
begin
  select l.status_id, s.name into v_current, v_from
  from leads l join lead_statuses s on s.id = l.status_id where l.id = p_lead_id;
  if not found then raise exception 'Lead not found'; end if;
  select name into v_to from lead_statuses where id = p_status_id;
  if v_to is null then raise exception 'Status not found'; end if;
  if v_current = p_status_id then return; end if;

  update leads set status_id = p_status_id where id = p_lead_id;
  if not found then raise exception 'Not permitted, or the lead no longer exists.'; end if;
  insert into lead_status_log (lead_id, from_status, to_status, note)
  values (p_lead_id, v_from, v_to, nullif(trim(p_note), ''));
end $$;
