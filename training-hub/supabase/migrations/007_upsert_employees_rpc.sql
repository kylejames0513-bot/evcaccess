-- ============================================================
-- Bulk-upsert RPC for the Google Sheets merged-sheet sync
-- ============================================================
-- PostgREST's on_conflict=col1,col2 query string can't target a
-- functional unique index (employees_name_unique_ci on
-- lower(last_name), lower(first_name)). Per-row PATCH from Apps
-- Script was taking 15+ minutes for ~2200 employees and blowing
-- through the 6-minute Apps Script execution limit.
--
-- This function takes the whole employee batch as a single JSONB
-- array and does ON CONFLICT server-side, turning the sync into
-- one or two HTTP calls instead of thousands.
--
-- Returns each row's id + last_name + first_name so the caller
-- can build a lookup without re-fetching.
-- ============================================================

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
