-- Sales users: they only work with leads assigned to them (see 0035). The enum value gets its own
-- migration because a new enum value cannot be used in the transaction that adds it.
alter type user_role add value if not exists 'sales';
