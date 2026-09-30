-- Many files per project (gallery images, brochures, floor plans) and a layout file per type.
create type project_file_kind as enum ('image', 'brochure', 'floor_plan');

create table project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  kind project_file_kind not null,
  title text,
  path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on project_files (project_id, kind, sort_order);
create trigger project_files_audit after insert or update or delete on project_files for each row execute function write_audit();

alter table project_files enable row level security;
create policy "read project_files" on project_files for select to authenticated using (true);
create policy "write project_files" on project_files for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

alter table unit_types add column layout_path text;

-- Move the single brochure / floor plan of each project into project_files.
insert into project_files (project_id, kind, title, path)
select id, 'brochure', 'Brochure', brochure_path from projects where brochure_path is not null;
insert into project_files (project_id, kind, title, path)
select id, 'floor_plan', 'Floor plan', floor_plan_path from projects where floor_plan_path is not null;

drop view inventory_view;
alter table projects drop column brochure_path, drop column floor_plan_path;

-- The view still exposes the first brochure / floor plan for the inventory links.
create view inventory_view with (security_invoker = true) as
select
  u.id as unit_type_id, p.id as project_id, p.name as project, p.usp,
  l.id as location_id, l.name as location,
  p.parking_charge, p.registration_pct, p.floor_hike_per_floor,
  b.id as builder_id, b.name as builder,
  c.id as configuration_id, c.name as config, c.sort_order as config_order,
  u.type_name, u.available_count, u.sqft, u.price, u.sqft_rate,
  p.property_type, p.total_floor_count, p.total_units,
  p.latitude, p.longitude,
  b.logo_path as builder_logo_path, p.thumbnail_path,
  (select f.path from project_files f where f.project_id = p.id and f.kind = 'floor_plan'
     order by f.sort_order, f.created_at limit 1) as floor_plan_path,
  (select f.path from project_files f where f.project_id = p.id and f.kind = 'brochure'
     order by f.sort_order, f.created_at limit 1) as brochure_path,
  p.status
from unit_types u
join projects p on p.id = u.project_id
join locations l on l.id = p.location_id
join configurations c on c.id = u.configuration_id
left join builders b on b.id = p.builder_id;
