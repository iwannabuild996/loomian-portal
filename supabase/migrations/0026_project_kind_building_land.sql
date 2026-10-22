-- Project kind gains "building" and "agricultural_land".
alter type property_type add value if not exists 'building';
alter type property_type add value if not exists 'agricultural_land';
