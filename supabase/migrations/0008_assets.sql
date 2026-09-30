-- Files: builder logo, project thumbnail, floor plan and brochure.
alter table builders add column logo_path text;
alter table projects
  add column thumbnail_path text,
  add column floor_plan_path text,
  add column brochure_path text;

-- One public bucket (files are served by URL, so anyone with a link can open it).
-- Only admins and editors can upload, replace or delete. SVG is excluded on purpose.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-assets', 'project-assets', true, 20971520,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "assets read" on storage.objects for select to authenticated
  using (bucket_id = 'project-assets');
create policy "assets insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-assets' and public.current_role_is('admin', 'editor'));
create policy "assets update" on storage.objects for update to authenticated
  using (bucket_id = 'project-assets' and public.current_role_is('admin', 'editor'))
  with check (bucket_id = 'project-assets' and public.current_role_is('admin', 'editor'));
create policy "assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'project-assets' and public.current_role_is('admin', 'editor'));

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
  b.logo_path as builder_logo_path, p.thumbnail_path, p.floor_plan_path, p.brochure_path
from unit_types u
join projects p on p.id = u.project_id
join locations l on l.id = p.location_id
join configurations c on c.id = u.configuration_id
left join builders b on b.id = p.builder_id;
