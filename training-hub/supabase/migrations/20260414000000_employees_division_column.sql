-- Formalize the `division` column on employees.
--
-- Background:
--   The Paylocity export has BOTH `Division Description` (umbrella
--   division: Residential, Facilities, Behavioral Health, Executive,
--   Human Resources, Community Engagement, Children Services, Family
--   Support, Professional Services, Workforce Innovation, etc.) and
--   `Department Description` (sub-unit: "Tiffin", "Admin", "289 Royce
--   Apt 207 (Long)", individual home addresses, etc.).
--
--   The hub previously stored only `employees.department`, and the
--   initial cutover load put the SUB-UNIT value into department. But
--   `required_trainings.department` is seeded with DIVISION names
--   (Residential, Executive, …) because that's how HR writes their
--   per-division rules.
--
--   The end result: the employee_compliance view joined
--   required_trainings.department = employees.department, which only
--   matched the handful of rows where the sub-unit name happened to
--   coincide with its parent division ("Residential", "Behavioral
--   Health"). For everyone else the compliance view effectively had no
--   matching required trainings and the /compliance and /new-hires
--   pages under-reported missing trainings.
--
--   The `division` column was quietly added to live employees at some
--   point to fix this, but no migration was ever written and only the
--   /api/new-hires route was updated to use it. This migration formally
--   adds the column so it appears in the generated types, the
--   compliance view can use it, and a fresh Supabase project can
--   reproduce the schema.
--
-- Idempotent: uses ADD COLUMN IF NOT EXISTS so it is safe to re-run
-- against environments where the column already exists.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS division TEXT;

-- Case-insensitive lookup index for per-division rule matching.
CREATE INDEX IF NOT EXISTS idx_employees_division
  ON employees (lower(division))
  WHERE division IS NOT NULL;

COMMENT ON COLUMN employees.division IS
  'Umbrella division name (Residential, Facilities, Behavioral Health, '
  'Executive, Human Resources, Community Engagement, Children Services, '
  'Family Support, Professional Services, Workforce Innovation, Board). '
  'This is the field required_trainings.department joins against. '
  'employees.department stores the sub-unit / home / cost center inside '
  'the division and is HR display only.';
