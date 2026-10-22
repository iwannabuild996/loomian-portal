-- Lead project types gain "agricultural_land" and "building".
alter type lead_project_type add value if not exists 'agricultural_land';
alter type lead_project_type add value if not exists 'building';
