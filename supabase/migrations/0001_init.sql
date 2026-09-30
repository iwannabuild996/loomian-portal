-- Enums
create type unit_config as enum ('1BHK', '2BHK', '3BHK', '4BHK', 'villa');
create type user_role as enum ('admin', 'editor', 'viewer');

-- Tables
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role user_role not null default 'viewer'
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text not null,
  usp text,
  parking_charge bigint,          -- rupees, null = NA
  registration_pct numeric(4,1),  -- null = NA
  floor_hike_per_floor bigint,    -- rupees, null = NA
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table unit_types (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  config unit_config not null,
  available_count int not null default 0 check (available_count >= 0),
  price_min bigint,
  price_max bigint,
  sqft_rate int,
  sqft_min int,
  sqft_max int,
  updated_at timestamptz not null default now(),
  check (price_max is null or price_min is null or price_max >= price_min),
  check (sqft_max is null or sqft_min is null or sqft_max >= sqft_min)
);
create index on unit_types (project_id);

create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);

-- Helpers
create function current_role_is(variadic roles user_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = any(roles));
$$;

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger projects_touch before update on projects for each row execute function touch_updated_at();
create trigger unit_types_touch before update on unit_types for each row execute function touch_updated_at();

create function write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (table_name, row_id, action, old_data, new_data)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end), gen_random_uuid()),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

create trigger projects_audit after insert or update or delete on projects for each row execute function write_audit();
create trigger unit_types_audit after insert or update or delete on unit_types for each row execute function write_audit();

-- New auth users get a viewer profile
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Flat view for the inventory grid
create view inventory_view with (security_invoker = true) as
select
  u.id as unit_type_id, p.id as project_id, p.name as project, p.location, p.usp,
  p.parking_charge, p.registration_pct, p.floor_hike_per_floor,
  u.config, u.available_count, u.price_min, u.price_max,
  u.sqft_rate, u.sqft_min, u.sqft_max
from unit_types u join projects p on p.id = u.project_id;

-- Row-level security
alter table profiles enable row level security;
alter table projects enable row level security;
alter table unit_types enable row level security;
alter table audit_log enable row level security;

create policy "read profiles" on profiles for select to authenticated using (true);
create policy "admin manages profiles" on profiles for all to authenticated
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy "read projects" on projects for select to authenticated using (true);
create policy "write projects" on projects for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

create policy "read unit_types" on unit_types for select to authenticated using (true);
create policy "write unit_types" on unit_types for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

create policy "admin reads audit" on audit_log for select to authenticated
  using (current_role_is('admin', 'editor'));

-- Realtime for availability changes
alter publication supabase_realtime add table unit_types;
