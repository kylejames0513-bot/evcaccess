
-- Bulk case-insensitive upsert for the Google Sheets merged-sheet sync.
-- PostgREST can't do ON CONFLICT against a functional index via
-- the on_conflict query string, so we wrap it in a SECURITY INVOKER
-- SQL function and call it over /rest/v1/rpc/.
--
-- The input is a JSON array of employee rows:
--   [{ last_name, first_name, is_active, department, hire_date, employee_number }, ...]
--
-- Returns each row's id + last_name + first_name so the caller can
-- build a lookup without re-fetching.
CREATE OR REPLACE FUNCTION upsert_employees_from_sheet(emps jsonb)
RETURNS TABLE (id uuid, last_name text, first_name text)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO employees (last_name, first_name, is_active, department, hire_date, employee_number)
  SELECT
    (e->>'last_name')::text,
    (e->>'first_name')::text,
    COALESCE((e->>'is_active')::boolean, true),
    NULLIF(e->>'department', '')::text,
    NULLIF(e->>'hire_date', '')::date,
    NULLIF(e->>'employee_number', '')::text
  FROM jsonb_array_elements(emps) AS e
  ON CONFLICT ((lower(employees.last_name)), (lower(employees.first_name))) DO UPDATE SET
    is_active       = EXCLUDED.is_active,
    department      = EXCLUDED.department,
    hire_date       = EXCLUDED.hire_date,
    employee_number = COALESCE(EXCLUDED.employee_number, employees.employee_number),
    updated_at      = now()
  RETURNING employees.id, employees.last_name, employees.first_name;
END;
$$;
