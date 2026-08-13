-- Grade-based travel/expense eligibility (per "Travel Rules & Guidelines W.E.F.
-- 01.06.2024"). profiles.grade is optional — engineers without a grade set see
-- no eligibility check at all, same as before this feature existed.
ALTER TABLE public.profiles ADD COLUMN grade TEXT
  CHECK (grade IN (
    'M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11',
    'WK GR I', 'WK GR II', 'WK GR III', 'WK GR IV'
  ));

-- Snapshotted at claim time so historical claims stay interpretable even if an
-- engineer's grade or the policy limits change later.
ALTER TABLE public.expense_logs ADD COLUMN claim_type TEXT CHECK (claim_type IN ('flat', 'actual'));
ALTER TABLE public.expense_logs ADD COLUMN eligible_limit NUMERIC(12,2);
ALTER TABLE public.expense_logs ADD COLUMN city_tier TEXT CHECK (city_tier IN ('metro', 'pondicherry', 'other'));
