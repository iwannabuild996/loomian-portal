-- Project-level facts: kind of property, floors and total units.
create type property_type as enum ('flat', 'villa');

alter table projects
  add column property_type property_type not null default 'flat',
  add column total_floor_count int check (total_floor_count is null or total_floor_count > 0),
  add column total_units int check (total_units is null or total_units > 0);

-- New columns are appended at the end, so the view can be replaced in place.
create or replace view inventory_view with (security_invoker = true) as
select
  u.id as unit_type_id, p.id as project_id, p.name as project, p.usp,
  l.id as location_id, l.name as location,
  p.parking_charge, p.registration_pct, p.floor_hike_per_floor,
  b.id as builder_id, b.name as builder,
  c.id as configuration_id, c.name as config, c.sort_order as config_order,
  u.type_name, u.available_count, u.sqft, u.price, u.sqft_rate,
  p.property_type, p.total_floor_count, p.total_units
from unit_types u
join projects p on p.id = u.project_id
join locations l on l.id = p.location_id
join configurations c on c.id = u.configuration_id
left join builders b on b.id = p.builder_id;

-- Existing villa project from the sample data
update projects set property_type = 'villa' where name = 'Villa - Above The World';
