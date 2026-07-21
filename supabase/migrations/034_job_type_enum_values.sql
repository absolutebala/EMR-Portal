-- New job types (Overhauling, Complaint, Installation, Testing, Business
-- Opportunity), added to the `job_type` enum (used by forms.job_type).
-- "Commissioning Activities" -> "Commissioning" is a display-label-only
-- rename in code — the stored value commissioning_activities is unchanged,
-- no migration needed for that part.
--
-- Run this migration BEFORE 035 — Postgres won't let a newly-added enum
-- value be used in the same transaction/script that added it, and 035
-- doesn't touch this enum anyway (work_orders.job_type is a separate TEXT
-- column with its own CHECK constraint), but keeping them as separate
-- executions avoids any ambiguity.
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'overhauling';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'complaint';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'installation';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'testing';
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'business_opportunity';
