-- Fix infinite recursion in profiles RLS policies.
-- The old policies queried `profiles` inside the policy itself, causing recursion.
-- Solution: a SECURITY DEFINER function that bypasses RLS to read the caller's role.

-- Drop old recursive policies

-- Recreate without recursion
