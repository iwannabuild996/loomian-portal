-- Lead management: contacts (with unique phone numbers), a lead-source master and leads.

create type lead_quality as enum ('hot', 'warm', 'cold');

create table contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A phone number can belong to one contact only: uniqueness is enforced on the normalised
-- "+<country code><number>" value, so the same person never gets a second contact.
create table contact_phones (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts on delete cascade,
  country_code text not null default '+91' check (country_code ~ '^\+[0-9]{1,4}$'),
  number text not null check (number ~ '^[0-9]{4,14}$'),
  has_whatsapp boolean not null default false,
  phone_e164 text generated always as (country_code || number) stored,
  unique (phone_e164)
);
create index on contact_phones (contact_id);

create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts on delete cascade,
  enquiry text,
  lead_source_id uuid references lead_sources on delete restrict,
  project_type property_type,
  requirement text,
  budget_lakhs numeric(10,2) check (budget_lakhs is null or budget_lakhs >= 0),
  quality lead_quality not null default 'warm',
  remarks text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on leads (contact_id);
create index on leads (quality);
create index on leads (created_at desc);

insert into lead_sources (name, sort_order) values
  ('Walk-in', 1), ('Website', 2), ('Referral', 3), ('Meta Ads', 4), ('Broker', 5);

create trigger contacts_touch before update on contacts for each row execute function touch_updated_at();
create trigger leads_touch before update on leads for each row execute function touch_updated_at();

create trigger contacts_audit after insert or update or delete on contacts for each row execute function write_audit();
create trigger contact_phones_audit after insert or update or delete on contact_phones for each row execute function write_audit();
create trigger lead_sources_audit after insert or update or delete on lead_sources for each row execute function write_audit();
create trigger leads_audit after insert or update or delete on leads for each row execute function write_audit();

alter table contacts enable row level security;
alter table contact_phones enable row level security;
alter table lead_sources enable row level security;
alter table leads enable row level security;

create policy "read contacts" on contacts for select to authenticated using (true);
create policy "write contacts" on contacts for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

create policy "read contact_phones" on contact_phones for select to authenticated using (true);
create policy "write contact_phones" on contact_phones for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

create policy "read lead_sources" on lead_sources for select to authenticated using (true);
create policy "write lead_sources" on lead_sources for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

create policy "read leads" on leads for select to authenticated using (true);
create policy "write leads" on leads for all to authenticated
  using (current_role_is('admin', 'editor')) with check (current_role_is('admin', 'editor'));

-- Live duplicate check for the form: the contact that already owns this number, if any.
create function find_contact_by_phone(p_phone text) returns table (id uuid, name text, email text)
language sql stable set search_path = public as $$
  select c.id, c.name, c.email
  from contact_phones cp join contacts c on c.id = cp.contact_id
  where cp.phone_e164 = p_phone
  limit 1;
$$;

-- Creates or updates a lead together with its contact and phones in one transaction.
-- p_phones: [{"country_code": "+91", "number": "9876543210", "has_whatsapp": true}, ...]
-- New lead: if any phone already belongs to a contact, that contact is reused (no duplicate is
-- created) and its missing phones/email are filled in. Edit: the contact's phones are replaced;
-- a number owned by a different contact fails with a unique violation (23505).
create function save_lead(
  p_lead_id uuid, p_name text, p_email text, p_phones jsonb, p_lead jsonb
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_contact uuid;
  v_lead uuid := p_lead_id;
  v_phone jsonb;
  v_e164 text;
begin
  if p_phones is null or jsonb_array_length(p_phones) = 0 then
    raise exception 'At least one phone number is required';
  end if;

  if p_lead_id is null then
    select cp.contact_id into v_contact
    from contact_phones cp
    where cp.phone_e164 in (select (x ->> 'country_code') || (x ->> 'number') from jsonb_array_elements(p_phones) x)
    limit 1;
    if v_contact is null then
      insert into contacts (name, email) values (p_name, nullif(p_email, '')) returning id into v_contact;
    else
      update contacts set email = coalesce(email, nullif(p_email, '')) where id = v_contact;
    end if;
  else
    select contact_id into v_contact from leads where id = p_lead_id;
    if v_contact is null then raise exception 'Lead not found'; end if;
    update contacts set name = p_name, email = nullif(p_email, '') where id = v_contact;
    delete from contact_phones
    where contact_id = v_contact
      and phone_e164 not in (select (x ->> 'country_code') || (x ->> 'number') from jsonb_array_elements(p_phones) x);
  end if;

  for v_phone in select * from jsonb_array_elements(p_phones) loop
    v_e164 := (v_phone ->> 'country_code') || (v_phone ->> 'number');
    update contact_phones set has_whatsapp = coalesce((v_phone ->> 'has_whatsapp')::boolean, false)
    where contact_id = v_contact and phone_e164 = v_e164;
    if not found and (p_lead_id is not null or not exists (select 1 from contact_phones where phone_e164 = v_e164)) then
      insert into contact_phones (contact_id, country_code, number, has_whatsapp)
      values (v_contact, v_phone ->> 'country_code', v_phone ->> 'number',
              coalesce((v_phone ->> 'has_whatsapp')::boolean, false));
    end if;
  end loop;

  if p_lead_id is null then
    insert into leads (contact_id, enquiry, lead_source_id, project_type, requirement, budget_lakhs, quality, remarks)
    values (
      v_contact, nullif(p_lead ->> 'enquiry', ''), (p_lead ->> 'lead_source_id')::uuid,
      (p_lead ->> 'project_type')::property_type, nullif(p_lead ->> 'requirement', ''),
      (p_lead ->> 'budget_lakhs')::numeric, coalesce((p_lead ->> 'quality')::lead_quality, 'warm'),
      nullif(p_lead ->> 'remarks', '')
    ) returning id into v_lead;
  else
    update leads set
      enquiry = nullif(p_lead ->> 'enquiry', ''), lead_source_id = (p_lead ->> 'lead_source_id')::uuid,
      project_type = (p_lead ->> 'project_type')::property_type, requirement = nullif(p_lead ->> 'requirement', ''),
      budget_lakhs = (p_lead ->> 'budget_lakhs')::numeric,
      quality = coalesce((p_lead ->> 'quality')::lead_quality, 'warm'), remarks = nullif(p_lead ->> 'remarks', '')
    where id = p_lead_id;
  end if;

  return v_lead;
end $$;
