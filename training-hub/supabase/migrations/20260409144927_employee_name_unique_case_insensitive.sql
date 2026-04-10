
-- Drop the case-sensitive UNIQUE constraint and replace with a
-- case-insensitive functional index so "McCulloch" and "Mcculloch"
-- upsert to the same row.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_name_unique;
DROP INDEX IF EXISTS employees_name_unique_ci;
CREATE UNIQUE INDEX employees_name_unique_ci
  ON employees (lower(last_name), lower(first_name));
