-- Blocked users: the admin-users Edge Function bans the login in Supabase Auth and sets this flag,
-- so the Users page can show who is blocked and the app can sign a blocked user out right away.
alter table profiles add column disabled boolean not null default false;
