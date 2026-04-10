-- Add paylocity_id as the canonical join key for employees, sourced from
-- the existing employee_number column. Additive, non-destructive: the old
-- employee_number column stays in place and the existing
-- upsert_employees_from_sheet RPC keeps working unchanged. Lib refactor in
-- step 2.4 will switch reads/writes over to paylocity_id, after which a
-- follow-up migration can drop employee_number.
--
-- Why a separate column instead of a rename: the live RPC, several API
-- routes, and the type definitions all reference employee_number. Renaming
-- in place would break them mid-migration. Adding a parallel column lets
-- the schema and the application converge gradually.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS paylocity_id TEXT;

-- Backfill from the existing employee_number column. Idempotent.
UPDATE employees
   SET paylocity_id = employee_number
 WHERE paylocity_id IS NULL
   AND employee_number IS NOT NULL;

-- Partial unique index. NULL is allowed (former employees with no number).
CREATE UNIQUE INDEX IF NOT EXISTS employees_paylocity_id_unique
  ON employees (paylocity_id)
  WHERE paylocity_id IS NOT NULL;

COMMENT ON COLUMN employees.paylocity_id IS
  'Canonical Paylocity employee ID. Same value as employee_number for now; '
  'employee_number will be dropped in a later migration once all reads/writes '
  'have been switched.';
