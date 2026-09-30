-- Builders, configurations (table instead of enum) and per-project types (A, B, C...).
-- A "type" (unit_types row) belongs to a project, maps to one configuration and one sqft.

drop view inventory_view;

-- Builders
create table builders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger builders_touch before update on builders for each row execute function touch_updated_at();
create trigger builders_audit after insert or update or delete on builders for each row execute function write_audit();

alter table projects add column builder_id uuid references builders on delete restrict;
create index on projects (builder_id);

-- Configurations
create table configurations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);
create trigger configurations_audit after insert or update or delete on configurations for each row execute function write_audit();

insert into configurations (name, sort_order) values
  ('1BHK', 1), ('2BHK', 2), ('3BHK', 3), ('4BHK', 4), ('Villa', 5);

-- Reshape unit_types into types
alter table unit_types
  add column configuration_id uuid references configurations on delete restrict,
  add column type_name text,
  add column sqft int,
  add column price bigint;

update unit_types u set configuration_id = c.id from configurations c where c.name = u.config::text;

-- Capture existing rows. Old rows held a sqft/price *range* per config; expand each range into
-- two placeholder types (low end = part 0 keeps the availability, high end = part 1 starts at 0).
create temp table old_units as
select id as src_id, project_id, configuration_id, available_count, sqft_rate,
       sqft_min, sqft_max, price_min, price_max
from unit_types;

create temp table expanded as
select src_id, 0 as part, project_id, configuration_id, sqft_rate, available_count,
       sqft_min as sqft, price_min as price
from old_units
union all
select src_id, 1, project_id, configuration_id, sqft_rate, 0,
       sqft_max, price_max
from old_units
where sqft_max is distinct from sqft_min or price_max is distinct from price_min;

alter table unit_types disable trigger unit_types_audit;
delete from unit_types;

alter table unit_types
  drop column config,
  drop column price_min,
  drop column price_max,
  drop column sqft_min,
  drop column sqft_max;

insert into unit_types (project_id, configuration_id, type_name, available_count, sqft, price, sqft_rate)
select e.project_id, e.configuration_id,
       chr(64 + row_number() over (partition by e.project_id order by c.sort_order, e.src_id, e.part)::int),
       e.available_count, e.sqft, e.price, e.sqft_rate
from expanded e join configurations c on c.id = e.configuration_id;

alter table unit_types enable trigger unit_types_audit;

alter table unit_types
  alter column configuration_id set not null,
  alter column type_name set not null,
  add constraint unit_types_sqft_positive check (sqft is null or sqft > 0),
  add constraint unit_types_price_positive check (price is null or price >= 0),
  add constraint unit_types_project_type_unique unique (project_id, type_name);
create index on unit_types (configuration_id);

drop type unit_config;

-- Inventory view: one row per type
create view inventory_view with (security_invoker = true) as
select
  u.id as unit_type_id, p.id as project_id, p.name as project, p.location, p.usp,
  p.parking_charge, p.registration_pct, p.floor_hike_per_floor,
  b.id as builder_id, b.name as builder,
  c.id as configuration_id, c.name as config, c.sort_order as config_order,
  u.type_name, u.available_count, u.sqft, u.price, u.sqft_rate
from unit_types u
join projects p on p.id = u.project_id
join configurations c on c.id = u.configuration_id
left join builders b on b.id = p.builder_id;

-- RLS
alter table builders enable row level security;
alter table configurations enable row level security;

create policy "read builders" on builders for select to authenticated using (true);
create policy "write builders" on builders for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

create policy "read configurations" on configurations for select to authenticated using (true);
create policy "write configurations" on configurations for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));
