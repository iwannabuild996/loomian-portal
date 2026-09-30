-- Sample data from the inventory spreadsheet. Seed runs as superuser, so RLS is bypassed.
insert into locations (name) values
  ('Vazhakkala'), ('Kalamassery'), ('Nettoor'), ('Vyttila'), ('Palarivattom'), ('Kakkanad');

insert into projects (name, location_id, usp, parking_charge, registration_pct, floor_hike_per_floor)
select v.name, l.id, v.usp, v.parking, v.reg, v.hike
from (values
  ('Awakened Living',           'Vazhakkala',   '600 Metres from Metro | 1 Acre Land | 40+ Amenities', 300000, 6,    null),
  ('Beyond Infinity',           'Kalamassery',  'Metro Pillar 321 | Futuristic Design with Smart features', 500000, 6, 50),
  ('Beneath The Wandering Leaf','Nettoor',      'Facing NH @ Nettoor | 40+ Amenities',                  400000, 6,    50),
  ('Global Town',               'Vyttila',      'Holiday INN | Designed for Aspiring Global Citizens',  500000, 6,    50),
  ('Grand Victorian Town',      'Palarivattom', 'Flyover | ReSort theme with Community Kitchen',        500000, 6,    50),
  ('Villa - Above The World',   'Kakkanad',     'From highway behind wonderla',                         null,   11,   null),
  ('The Next Prodigy',          'Kakkanad',     'Adjacent to INFOPARK Phase 2',                         250000, 6,    50),
  ('TownCastle',                'Kalamassery',  'Facing NH | Metro Pillar 318',                         null,   null, null)
) as v(name, location, usp, parking, reg, hike)
join locations l on l.name = v.location;

update projects set property_type = 'villa' where name = 'Villa - Above The World';

-- Floor hike "50 per floor" is stored as the raw sheet number (50); confirm the unit (₹ vs ₹ thousand) with the team.

-- Types per project. Sheet ranges (e.g. 935 - 1029 sqft) are split into placeholder types
-- (low end carries the availability); replace with the real A/B/C plans when known.
insert into unit_types (project_id, configuration_id, type_name, available_count, sqft, price, sqft_rate)
select p.id, c.id, v.type_name, v.avail, v.sqft, v.price, v.rate
from (values
  ('Awakened Living','A','2BHK',10, 935,  7100000, 6750),
  ('Awakened Living','B','2BHK', 0, 1029, 7900000, 6750),
  ('Awakened Living','C','3BHK', 1, 1306, 9800000, 6750),
  ('Beyond Infinity','A','2BHK', 3, 1150,10600000, 8100),
  ('Beyond Infinity','B','3BHK', 2, 1360,12400000, 8100),
  ('Beyond Infinity','C','4BHK', 3, 1972,17600000, 8100),
  ('Beneath The Wandering Leaf','A','2BHK',31, 1094, 9300000, 7500),
  ('Beneath The Wandering Leaf','B','2BHK', 0, 1097, 9300000, 7500),
  ('Beneath The Wandering Leaf','C','3BHK',10, 1766,14700000, 7500),
  ('Beneath The Wandering Leaf','D','3BHK', 0, 1781,14700000, 7500),
  ('Global Town','A','1BHK',11, 488,  5000000, 9000),
  ('Global Town','B','1BHK', 0, 661,  6600000, 9000),
  ('Global Town','C','2BHK',17, 992,  9700000, 9000),
  ('Global Town','D','2BHK', 0, 1025,10200000, 9000),
  ('Global Town','E','3BHK', 9, 1480,14400000, 9000),
  ('Grand Victorian Town','A','1BHK', 0, 442,  5000000, 9000),
  ('Grand Victorian Town','B','2BHK',16, 553,  5900000, 9000),
  ('Grand Victorian Town','C','2BHK', 0, 995, 10100000, 9000),
  ('Grand Victorian Town','D','3BHK', 9, 1072,10900000, 9000),
  ('Grand Victorian Town','E','3BHK', 0, 1213,12200000, 9000),
  ('Villa - Above The World','A','3BHK',3, 1500,10000000, 6000),
  ('Villa - Above The World','B','3BHK',0, 2200,15000000, 6000),
  ('Villa - Above The World','C','4BHK',1, 2000,13000000, 6000),
  ('Villa - Above The World','D','4BHK',0, 3000,18000000, 6000),
  ('The Next Prodigy','A','2BHK',1, 1054, 7200000, 6250),
  ('The Next Prodigy','B','3BHK',7, 1609,11000000, 6250),
  ('The Next Prodigy','C','3BHK',0, 1665,11400000, 6250),
  ('TownCastle','A','1BHK',5, 420,  4000000, 9000),
  ('TownCastle','B','1BHK',0, 516,  4800000, 9000),
  ('TownCastle','C','2BHK',1, 969,  9000000, 9000)
) as v(project, type_name, config, avail, sqft, price, rate)
join projects p on p.name = v.project
join configurations c on c.name = v.config;
