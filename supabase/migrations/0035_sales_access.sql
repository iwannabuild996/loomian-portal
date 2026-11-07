-- Sales access: a sales user sees only the leads assigned to them (plus the contacts, tasks and
-- meetings that hang off those leads), and the leads they add are assigned to them automatically.
-- Admins and editors see everything and can assign / reassign leads. Viewers are unchanged.

-- ---------------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------------
-- Existing leads stay unassigned (null): only admins/editors/viewers see them until assigned.
alter table leads add column assigned_to uuid references profiles on delete set null;
create index on leads (assigned_to);

-- Lets a sales user see (and complete the save of) a contact they just created, before it has a lead.
alter table contacts add column created_by uuid default auth.uid() references profiles on delete set null;

-- ---------------------------------------------------------------------------------------------
-- Helpers (security definer, so policies on one table can look at another without recursion)
-- ---------------------------------------------------------------------------------------------
create function can_access_lead(p_lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not current_role_is('sales')
      or exists (select 1 from leads where id = p_lead and assigned_to = auth.uid());
$$;

create function can_access_contact(p_contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not current_role_is('sales')
      or exists (select 1 from contacts where id = p_contact and created_by = auth.uid())
      or exists (select 1 from leads where contact_id = p_contact and assigned_to = auth.uid());
$$;

-- ---------------------------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------------------------
drop policy "read leads" on leads;
create policy "read leads" on leads for select to authenticated
  using (not current_role_is('sales') or assigned_to = auth.uid());

create policy "sales insert leads" on leads for insert to authenticated
  with check (current_role_is('sales') and assigned_to = auth.uid());
create policy "sales update leads" on leads for update to authenticated
  using (current_role_is('sales') and assigned_to = auth.uid())
  with check (current_role_is('sales') and assigned_to = auth.uid());

-- A lead a sales user adds is always assigned to them; they cannot hand a lead to someone else.
create function lead_sales_assignment() returns trigger language plpgsql set search_path = public as $$
begin
  if current_role_is('sales') then
    if tg_op = 'INSERT' then
      new.assigned_to := auth.uid();
    elsif new.assigned_to is distinct from old.assigned_to then
      raise exception 'Only an admin can reassign a lead.';
    end if;
  end if;
  return new;
end $$;
create trigger leads_sales_assignment before insert or update on leads
  for each row execute function lead_sales_assignment();

-- ---------------------------------------------------------------------------------------------
-- Contacts and phones
-- ---------------------------------------------------------------------------------------------
drop policy "read contacts" on contacts;
-- created_by is checked inline (not via can_access_contact) so that `insert ... returning` works:
-- a function cannot see the row its own statement is inserting.
create policy "read contacts" on contacts for select to authenticated
  using (created_by = auth.uid() or can_access_contact(id));
create policy "sales insert contacts" on contacts for insert to authenticated
  with check (current_role_is('sales') and created_by = auth.uid());
create policy "sales update contacts" on contacts for update to authenticated
  using (current_role_is('sales') and (created_by = auth.uid() or can_access_contact(id)))
  with check (current_role_is('sales') and (created_by = auth.uid() or can_access_contact(id)));

drop policy "read contact_phones" on contact_phones;
create policy "read contact_phones" on contact_phones for select to authenticated using (can_access_contact(contact_id));
create policy "sales write contact_phones" on contact_phones for all to authenticated
  using (current_role_is('sales') and can_access_contact(contact_id))
  with check (current_role_is('sales') and can_access_contact(contact_id));

-- ---------------------------------------------------------------------------------------------
-- Tables hanging off a lead
-- ---------------------------------------------------------------------------------------------
drop policy "read lead_locations" on lead_locations;
create policy "read lead_locations" on lead_locations for select to authenticated using (can_access_lead(lead_id));
create policy "sales write lead_locations" on lead_locations for all to authenticated
  using (current_role_is('sales') and can_access_lead(lead_id))
  with check (current_role_is('sales') and can_access_lead(lead_id));

drop policy "read lead_builders" on lead_builders;
create policy "read lead_builders" on lead_builders for select to authenticated using (can_access_lead(lead_id));
create policy "sales write lead_builders" on lead_builders for all to authenticated
  using (current_role_is('sales') and can_access_lead(lead_id))
  with check (current_role_is('sales') and can_access_lead(lead_id));

drop policy "read lead_source_links" on lead_source_links;
create policy "read lead_source_links" on lead_source_links for select to authenticated using (can_access_lead(lead_id));
create policy "sales write lead_source_links" on lead_source_links for all to authenticated
  using (current_role_is('sales') and can_access_lead(lead_id))
  with check (current_role_is('sales') and can_access_lead(lead_id));

drop policy "read lead_status_log" on lead_status_log;
create policy "read lead_status_log" on lead_status_log for select to authenticated using (can_access_lead(lead_id));
create policy "sales insert lead_status_log" on lead_status_log for insert to authenticated
  with check (current_role_is('sales') and can_access_lead(lead_id));
create policy "sales update lead_status_log" on lead_status_log for update to authenticated
  using (current_role_is('sales') and can_access_lead(lead_id))
  with check (current_role_is('sales') and can_access_lead(lead_id));

-- ---------------------------------------------------------------------------------------------
-- Tasks and meetings: those on the sales user's leads, plus the standalone ones they created.
-- ---------------------------------------------------------------------------------------------
drop policy "read lead_tasks" on lead_tasks;
create policy "read lead_tasks" on lead_tasks for select to authenticated
  using (can_access_lead(lead_id) or (lead_id is null and created_by = auth.uid()));
create policy "sales write lead_tasks" on lead_tasks for all to authenticated
  using (current_role_is('sales') and (can_access_lead(lead_id) or (lead_id is null and created_by = auth.uid())))
  with check (current_role_is('sales') and (can_access_lead(lead_id) or (lead_id is null and created_by = auth.uid())));

drop policy "read meetings" on meetings;
create policy "read meetings" on meetings for select to authenticated
  using (can_access_lead(lead_id) or (lead_id is null and created_by = auth.uid()));
create policy "sales write meetings" on meetings for all to authenticated
  using (current_role_is('sales') and (can_access_lead(lead_id) or (lead_id is null and created_by = auth.uid())))
  with check (current_role_is('sales') and (can_access_lead(lead_id) or (lead_id is null and created_by = auth.uid())));
