-- Possession is only ever known to the month, so it is stored as the first day of that month.
alter table projects
  add column possession_date date check (possession_date is null or extract(day from possession_date) = 1);

-- Expose it to the inventory table. A new column goes last so the view can be replaced in place.
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
  b.logo_path as builder_logo_path, p.thumbnail_path,
  (select f.path from project_files f where f.project_id = p.id and f.kind = 'floor_plan'
     order by f.sort_order, f.created_at limit 1) as floor_plan_path,
  (select f.path from project_files f where f.project_id = p.id and f.kind = 'brochure'
     order by f.sort_order, f.created_at limit 1) as brochure_path,
  p.status,
  p.possession_date
from unit_types u
join projects p on p.id = u.project_id
join locations l on l.id = p.location_id
join configurations c on c.id = u.configuration_id
left join builders b on b.id = p.builder_id;
