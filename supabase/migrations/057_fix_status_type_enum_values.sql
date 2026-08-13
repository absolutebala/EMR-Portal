-- Documents real schema drift discovered during the Supabase -> RDS migration
-- (Phase C): status_type only had 3 values tracked in migration 001
-- (yes_no, tested_not_tested, checkbox_only), but live production data uses 4 more
-- (two_party, two_party_exclusive, observation, measurement) that were added directly
-- against Supabase at some point, never through this migration history. Retroactively
-- recorded here so the tracked migrations match reality.
--
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction block as a
-- subsequent statement that uses the new value (a Postgres restriction) — fine here
-- since nothing later in this same file uses these values.
ALTER TYPE status_type ADD VALUE IF NOT EXISTS 'two_party';
ALTER TYPE status_type ADD VALUE IF NOT EXISTS 'two_party_exclusive';
ALTER TYPE status_type ADD VALUE IF NOT EXISTS 'observation';
ALTER TYPE status_type ADD VALUE IF NOT EXISTS 'measurement';
