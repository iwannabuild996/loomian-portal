-- Construction status of a project. Existing projects default to off-plan; update them in the admin.
create type project_status as enum ('ready_to_move', 'off_plan');

alter table projects add column status project_status not null default 'off_plan';

create or replace view inventory_view with (security_invoker = true) as
select
  u.id as unit_type_id, p.id as project_id, p.name as project, p.usp,
  l.id as location_id, l.name as location,
  p.parking_charge, p.registration_pct, p.floor_hike_per_floor,
  b.id as builder_id, b.name as builder,
  c.id as configuration_id, c.name as config, c.sort_order as config_order,
  u.type_name, u.available_count, u.sqft, u.price, u.sqft_rate,
  p.property_type, p.total_floor_count, p.total_units,
  p.latitude, p.longitude,
  b.logo_path as builder_logo_path, p.thumbnail_path, p.floor_plan_path, p.brochure_path,
  p.status
from unit_types u
join projects p on p.id = u.project_id
join locations l on l.id = p.location_id
join configurations c on c.id = u.configuration_id
left join builders b on b.id = p.builder_id;
