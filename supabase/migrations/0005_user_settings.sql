-- Per-user preferences. Each user can only read and write their own row.
create table user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  hide_stock boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger user_settings_touch before update on user_settings for each row execute function touch_updated_at();

alter table user_settings enable row level security;
create policy "own settings select" on user_settings for select to authenticated using (user_id = auth.uid());
create policy "own settings insert" on user_settings for insert to authenticated with check (user_id = auth.uid());
create policy "own settings update" on user_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
