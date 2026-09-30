-- Project kind is "apartment" or "villa" (was "flat" or "villa").
-- Existing rows, the column default and the inventory view follow the renamed value automatically.
alter type property_type rename value 'flat' to 'apartment';
