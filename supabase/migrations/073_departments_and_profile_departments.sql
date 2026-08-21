-- Replaces the hardcoded 6-department list (lib/departments.ts) and free-text
-- profiles.department with a real, admin-manageable table — plus a new
-- many-to-many join table so non-Field-Engineer roles (Service Manager etc.) can
-- be assigned to more than one department, which drives department-scoped
-- approval routing for attendance/expense/product-request notifications.
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.departments (name) VALUES
  ('NIFPS 1'), ('NIFPS 2'), ('OLTC'), ('L&Breather'), ('Global'), ('New Product');

-- Field Engineers: single department, now FK'd instead of free text.
ALTER TABLE public.profiles ADD COLUMN department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;
UPDATE public.profiles p SET department_id = d.id FROM public.departments d WHERE p.department = d.name;
ALTER TABLE public.profiles DROP COLUMN department;

-- Service Manager (and any other non-Field-Engineer role): multi-department assignment.
CREATE TABLE public.profile_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, department_id)
);
CREATE INDEX profile_departments_department_idx ON public.profile_departments (department_id);
