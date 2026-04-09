-- ============================================================
-- Employee number (human-readable ID)
-- ============================================================
-- Adds a column for the HR-assigned employee ID (Paylocity or
-- internal). Distinct from the UUID primary key — this is the
-- number that shows on their badge and that HR uses day-to-day.
-- ============================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_number TEXT;

-- Partial unique index: every assigned number must be unique,
-- but NULL is allowed for rows that haven't been assigned one.
CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_number_unique
  ON employees (employee_number)
  WHERE employee_number IS NOT NULL;
