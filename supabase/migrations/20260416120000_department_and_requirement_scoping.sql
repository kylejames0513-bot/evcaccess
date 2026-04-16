-- Add department column to employees (Training sheet has "Department Description").
-- Expand training_requirements to support department + division scoping.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS employees_org_department_idx ON public.employees (org_id, department);

ALTER TABLE public.training_requirements ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.training_requirements ADD COLUMN IF NOT EXISTS division text;
