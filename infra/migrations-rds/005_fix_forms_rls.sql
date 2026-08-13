-- Fix forms-related RLS policies.
-- The original policies queried `profiles` directly, which can fail for certain role setups.
-- Use get_my_role() (SECURITY DEFINER, bypasses RLS) for reliable role checks.

-- FORMS

-- FORM SECTIONS

-- FORM FIELDS

-- FORM TABLES

-- FORM TABLE ROWS
