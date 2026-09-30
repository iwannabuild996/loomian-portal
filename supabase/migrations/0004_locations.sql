-- Locations become a table; projects reference it instead of holding free text.

drop view inventory_view;

create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger locations_touch before update on locations for each row execute function touch_updated_at();
create trigger locations_audit after insert or update or delete on locations for each row execute function write_audit();

insert into locations (name) select distinct trim(location) from projects;

alter table projects add column location_id uuid references locations on delete restrict;
update projects p set location_id = l.id from locations l where l.name = trim(p.location);
alter table projects
  alter column location_id set not null,
  drop column location;
create index on projects (location_id);

create view inventory_view with (security_invoker = true) as
select
  u.id as unit_type_id, p.id as project_id, p.name as project, p.usp,
  l.id as location_id, l.name as location,
  p.parking_charge, p.registration_pct, p.floor_hike_per_floor,
  b.id as builder_id, b.name as builder,
  c.id as configuration_id, c.name as config, c.sort_order as config_order,
  u.type_name, u.available_count, u.sqft, u.price, u.sqft_rate
from unit_types u
join projects p on p.id = u.project_id
join locations l on l.id = p.location_id
join configurations c on c.id = u.configuration_id
left join builders b on b.id = p.builder_id;

alter table locations enable row level security;
create policy "read locations" on locations for select to authenticated using (true);
create policy "write locations" on locations for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));
