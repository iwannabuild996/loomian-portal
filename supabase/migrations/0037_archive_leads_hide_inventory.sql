-- Archived leads: kept (with their tasks, meetings and history) but moved out of the main list.
-- Set archived_at to archive, null to restore. Anyone who can edit a lead can archive it.
alter table leads add column archived_at timestamptz;
create index on leads (archived_at);

-- Inventory is hidden from sales users: block it at the database too, not just in the app.
drop policy "read projects" on projects;
create policy "read projects" on projects for select to authenticated using (not current_role_is('sales'));

drop policy "read unit_types" on unit_types;
create policy "read unit_types" on unit_types for select to authenticated using (not current_role_is('sales'));

drop policy "read project_files" on project_files;
create policy "read project_files" on project_files for select to authenticated using (not current_role_is('sales'));
