-- Show who is who in the admin Users page.
alter table profiles add column email text;
update profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end $$;
