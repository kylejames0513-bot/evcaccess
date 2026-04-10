
-- Human-readable employee ID (Paylocity or internal HR number).
-- Distinct from the internal UUID primary key. This is the
-- number HR gives to every new hire and shows on their badge.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_number TEXT;

-- Partial unique index so the same ID can't be assigned twice,
-- but NULL is allowed (existing rows don't have one yet).
CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_number_unique
  ON employees (employee_number)
  WHERE employee_number IS NOT NULL;
