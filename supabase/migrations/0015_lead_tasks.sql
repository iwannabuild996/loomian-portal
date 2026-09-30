-- Tasks on leads (site visit, follow-up call, Google Meet, ...) with a due date and a done state.

create table task_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

insert into task_types (name, sort_order) values
  ('Follow-up call', 1), ('Site visit', 2), ('Google Meet call', 3), ('Send details', 4), ('Other', 5);

create table lead_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads on delete cascade,
  task_type_id uuid not null references task_types on delete restrict,
  due_at timestamptz not null,
  notes text,
  completed_at timestamptz,
  created_by uuid default auth.uid() references profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on lead_tasks (lead_id);
-- The Tasks page lists what is still pending by due date.
create index on lead_tasks (due_at) where completed_at is null;

create trigger lead_tasks_touch before update on lead_tasks for each row execute function touch_updated_at();
create trigger task_types_audit after insert or update or delete on task_types for each row execute function write_audit();
create trigger lead_tasks_audit after insert or update or delete on lead_tasks for each row execute function write_audit();

alter table task_types enable row level security;
alter table lead_tasks enable row level security;

create policy "read task_types" on task_types for select to authenticated using (true);
create policy "write task_types" on task_types for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

create policy "read lead_tasks" on lead_tasks for select to authenticated using (true);
create policy "write lead_tasks" on lead_tasks for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));
