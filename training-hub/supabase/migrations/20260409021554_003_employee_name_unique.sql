
-- Add unique constraint on employee names for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_unique_name ON employees (lower(last_name), lower(first_name));
