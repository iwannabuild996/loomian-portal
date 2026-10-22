-- Tasks no longer need a lead: they can be standalone, or still linked to one.
alter table lead_tasks alter column lead_id drop not null;
