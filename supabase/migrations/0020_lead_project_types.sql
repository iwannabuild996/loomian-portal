-- A lead can be interested in several project types, including non-residential ones. This is a lead-only
-- enum: property_type (apartment / villa) stays as is, since projects and the inventory use it.
create type lead_project_type as enum
  ('apartment', 'villa', 'commercial_land', 'residential_land', 'office_space', 'coworking');
alter table leads add column project_types lead_project_type[] not null default '{}';
update leads set project_types = array[project_type::text::lead_project_type] where project_type is not null;
alter table leads drop column project_type;

-- save_lead now reads project_types (array) instead of project_type; otherwise unchanged from 0019.
create or replace function save_lead(
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
    insert into leads (contact_id, enquiry, lead_source_id, project_types, requirement, categories,
                       budget_min_lakhs, budget_max_lakhs, quality, remarks)
    values (
      v_contact, nullif(p_lead ->> 'enquiry', ''), (p_lead ->> 'lead_source_id')::uuid,
      array(select x::lead_project_type from jsonb_array_elements_text(coalesce(p_lead -> 'project_types', '[]'::jsonb)) x),
      nullif(p_lead ->> 'requirement', ''),
      array(select x::lead_category from jsonb_array_elements_text(coalesce(p_lead -> 'categories', '[]'::jsonb)) x),
      (p_lead ->> 'budget_min_lakhs')::numeric, (p_lead ->> 'budget_max_lakhs')::numeric,
      coalesce((p_lead ->> 'quality')::lead_quality, 'warm'), nullif(p_lead ->> 'remarks', '')
    ) returning id into v_lead;
  else
    update leads set
      enquiry = nullif(p_lead ->> 'enquiry', ''), lead_source_id = (p_lead ->> 'lead_source_id')::uuid,
      project_types = array(select x::lead_project_type from jsonb_array_elements_text(coalesce(p_lead -> 'project_types', '[]'::jsonb)) x),
      requirement = nullif(p_lead ->> 'requirement', ''),
      categories = array(select x::lead_category from jsonb_array_elements_text(coalesce(p_lead -> 'categories', '[]'::jsonb)) x),
      budget_min_lakhs = (p_lead ->> 'budget_min_lakhs')::numeric,
      budget_max_lakhs = (p_lead ->> 'budget_max_lakhs')::numeric,
      quality = coalesce((p_lead ->> 'quality')::lead_quality, 'warm'), remarks = nullif(p_lead ->> 'remarks', '')
    where id = p_lead_id;
    delete from lead_locations where lead_id = p_lead_id;
    delete from lead_builders where lead_id = p_lead_id;
  end if;

  insert into lead_locations (lead_id, location_id)
  select v_lead, x::uuid from jsonb_array_elements_text(coalesce(p_lead -> 'location_ids', '[]'::jsonb)) x
  on conflict do nothing;

  -- builder_ids: every builder allocated to the lead; enquired_builder_ids: the subset the lead asked about.
  insert into lead_builders (lead_id, builder_id, is_enquired)
  select v_lead, x::uuid,
         coalesce(p_lead -> 'enquired_builder_ids', '[]'::jsonb) ? x
  from jsonb_array_elements_text(coalesce(p_lead -> 'builder_ids', '[]'::jsonb)) x
  on conflict do nothing;

  return v_lead;
end $$;
