-- Adds freeform "Product Hierarchy" and "Level 1" fields to the product catalog, for
-- the Excel bulk-upload feature (Product Name, Product ID [= existing sap_code],
-- Product Hierarchy, Level 1). Plain text columns, not normalized lookup tables — per
-- explicit product decision, 2026-08-19.
ALTER TABLE public.products
  ADD COLUMN hierarchy TEXT,
  ADD COLUMN level_1 TEXT;
