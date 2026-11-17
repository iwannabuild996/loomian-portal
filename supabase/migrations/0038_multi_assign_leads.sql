-- A lead can be assigned to several salespeople at once, all with equal rights.
-- leads.assigned_to (one person) is replaced by the lead_assignees join table; existing
-- assignments are migrated as-is. Admins/editors assign; sales users see leads they are assigned to.

create table lead_assignees (
  lead_id uuid not null references leads on delete cascade,
  profile_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, profile_id)
);
create index on lead_assignees (profile_id);
alter table lead_assignees enable row level security;

insert into lead_assignees (lead_id, profile_id)
select id, assigned_to from leads where assigned_to is not null;

-- ---------------------------------------------------------------------------------------------
-- Drop everything that depends on leads.assigned_to
-- ---------------------------------------------------------------------------------------------
drop trigger leads_sales_assignment on leads;
drop function lead_sales_assignment();
drop policy "read leads" on leads;
drop policy "sales insert leads" on leads;
drop policy "sales update leads" on leads;
alter table leads drop column assigned_to;

-- ---------------------------------------------------------------------------------------------
-- Access helpers (same names as before, now based on lead_assignees)
-- ---------------------------------------------------------------------------------------------
create or replace function can_access_lead(p_lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not current_role_is('sales')
      or exists (select 1 from lead_assignees where lead_id = p_lead and profile_id = auth.uid());
$$;

create or replace function can_access_contact(p_contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not current_role_is('sales')
      or exists (select 1 from contacts where id = p_contact and created_by = auth.uid())
      or exists (
        select 1 from leads l join lead_assignees la on la.lead_id = l.id
        where l.contact_id = p_contact and la.profile_id = auth.uid()
      );
$$;

-- ---------------------------------------------------------------------------------------------
-- lead_assignees policies: anyone who can see a lead sees who it is assigned to; only
-- admins/editors change assignments.
-- ---------------------------------------------------------------------------------------------
create policy "read lead_assignees" on lead_assignees for select to authenticated
  using (can_access_lead(lead_id));
create policy "staff write lead_assignees" on lead_assignees for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

-- ---------------------------------------------------------------------------------------------
-- Leads policies
-- ---------------------------------------------------------------------------------------------
-- insert_owner: set only while a sales user's INSERT statement is running. A policy cannot see
-- the assignee row that an AFTER trigger adds, and `insert ... returning` (used by save_lead)
-- must be able to read the new row, so this column covers that one moment. The AFTER trigger
-- below turns it into a lead_assignees row and clears it, so it never grants lasting access.
alter table leads add column insert_owner uuid;

create policy "read leads" on leads for select to authenticated
  using (not current_role_is('sales') or insert_owner = auth.uid() or can_access_lead(id));

create policy "sales insert leads" on leads for insert to authenticated
  with check (current_role_is('sales') and insert_owner = auth.uid());
create policy "sales update leads" on leads for update to authenticated
  using (current_role_is('sales') and can_access_lead(id))
  with check (current_role_is('sales') and can_access_lead(id));

create function lead_set_insert_owner() returns trigger language plpgsql set search_path = public as $$
begin
  new.insert_owner := case when current_role_is('sales') then auth.uid() else null end;
  return new;
end $$;
create trigger leads_insert_owner before insert on leads
  for each row execute function lead_set_insert_owner();

-- A lead a sales user adds is assigned to them automatically.
create function lead_assign_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.insert_owner is not null then
    insert into lead_assignees (lead_id, profile_id) values (new.id, new.insert_owner)
    on conflict do nothing;
    update leads set insert_owner = null where id = new.id;
  end if;
  return null;
end $$;
create trigger leads_assign_creator after insert on leads
  for each row execute function lead_assign_creator();
