-- All-or-nothing project importer. The web app sends the reviewed plan as JSON and this function
-- applies it in ONE transaction: if anything fails, nothing is saved. With p_dry_run = true it
-- runs the whole import (so every database rule is checked) and then rolls it back.
--
-- Runs as the caller (security invoker), so row level security still decides what is allowed.
-- p_data = {
--   "new_locations": ["name", ...],
--   "projects": [{
--     "action": "create" | "update", "id": uuid (update), "name": text,
--     "location_name": text (only when the location should be set),
--     "payload": { project columns to write },
--     "types": [{ "action": "create" | "update", "id": uuid (update), "type_name": text, "payload": { type columns } }]
--   }]
-- }

create function import_projects(p_builder_id uuid, p_data jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  project_cols constant text[] := array[
    'property_type', 'status', 'possession_date', 'total_floor_count', 'total_units', 'latitude',
    'longitude', 'usp', 'parking_charge', 'registration_pct', 'floor_hike_per_floor'];
  type_cols constant text[] := array['configuration_id', 'sqft', 'available_count', 'price', 'sqft_rate'];
  loc text;
  pj jsonb;
  ty jsonb;
  pid uuid;
  loc_id uuid;
  cols text;
  sets text;
  changed int;
  n_projects_created int := 0;
  n_projects_updated int := 0;
  n_types_created int := 0;
  n_types_updated int := 0;
begin
  if not current_role_is('admin', 'editor') then
    raise exception 'Not permitted';
  end if;
  if not exists (select 1 from builders where id = p_builder_id) then
    raise exception 'Builder not found';
  end if;

  begin
    for loc in select jsonb_array_elements_text(coalesce(p_data -> 'new_locations', '[]')) loop
      if not exists (select 1 from locations where lower(name) = lower(loc)) then
        insert into locations (name) values (loc);
      end if;
    end loop;

    for pj in select * from jsonb_array_elements(coalesce(p_data -> 'projects', '[]')) loop
      begin
        if exists (select 1 from jsonb_object_keys(coalesce(pj -> 'payload', '{}')) k where k <> all (project_cols)) then
          raise exception 'Unsupported project field';
        end if;

        loc_id := null;
        if pj ->> 'location_name' is not null then
          select id into loc_id from locations where lower(name) = lower(pj ->> 'location_name');
          if loc_id is null then raise exception 'Location "%" not found', pj ->> 'location_name'; end if;
        end if;

        select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(coalesce(pj -> 'payload', '{}')) k;

        if pj ->> 'action' = 'create' then
          execute format(
            'insert into projects (name, builder_id, location_id%1$s) select $2::text, $3::uuid, $4::uuid%1$s from jsonb_populate_record(null::projects, $1) returning id',
            coalesce(', ' || cols, ''))
            into pid using coalesce(pj -> 'payload', '{}'), pj ->> 'name', p_builder_id, loc_id;
          n_projects_created := n_projects_created + 1;
        else
          pid := (pj ->> 'id')::uuid;
          select string_agg(format('%1$I = r.%1$I', k), ', ') into sets from jsonb_object_keys(coalesce(pj -> 'payload', '{}')) k;
          if loc_id is not null then sets := concat_ws(', ', sets, 'location_id = $3::uuid'); end if;
          if sets is not null then
            execute format('update projects p set %s from jsonb_populate_record(null::projects, $1) r where p.id = $2::uuid', sets)
              using coalesce(pj -> 'payload', '{}'), pid, loc_id;
            get diagnostics changed = row_count;
            if changed = 0 then raise exception 'Project not found, or not permitted'; end if;
          end if;
          n_projects_updated := n_projects_updated + 1;
        end if;

        for ty in select * from jsonb_array_elements(coalesce(pj -> 'types', '[]')) loop
          begin
            if exists (select 1 from jsonb_object_keys(coalesce(ty -> 'payload', '{}')) k where k <> all (type_cols)) then
              raise exception 'Unsupported type field';
            end if;
            select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(coalesce(ty -> 'payload', '{}')) k;

            if ty ->> 'action' = 'create' then
              execute format(
                'insert into unit_types (project_id, type_name%1$s) select $2::uuid, $3::text%1$s from jsonb_populate_record(null::unit_types, $1)',
                coalesce(', ' || cols, ''))
                using coalesce(ty -> 'payload', '{}'), pid, ty ->> 'type_name';
              n_types_created := n_types_created + 1;
            else
              select string_agg(format('%1$I = r.%1$I', k), ', ') into sets from jsonb_object_keys(coalesce(ty -> 'payload', '{}')) k;
              if sets is not null then
                execute format('update unit_types u set %s from jsonb_populate_record(null::unit_types, $1) r where u.id = $2::uuid', sets)
                  using coalesce(ty -> 'payload', '{}'), (ty ->> 'id')::uuid;
                get diagnostics changed = row_count;
                if changed = 0 then raise exception 'Type not found, or not permitted'; end if;
              end if;
              n_types_updated := n_types_updated + 1;
            end if;
          exception when others then
            raise exception 'Type %: %', ty ->> 'type_name', sqlerrm using errcode = sqlstate;
          end;
        end loop;
      exception when others then
        raise exception 'Project "%": %', pj ->> 'name', sqlerrm using errcode = sqlstate;
      end;
    end loop;

    if p_dry_run then
      raise exception 'dry run' using errcode = 'IM001';
    end if;
  exception when sqlstate 'IM001' then
    null; -- everything above is rolled back; only the counts below survive
  end;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'projects_created', n_projects_created, 'projects_updated', n_projects_updated,
    'types_created', n_types_created, 'types_updated', n_types_updated);
end $$;

grant execute on function import_projects(uuid, jsonb, boolean) to authenticated;
