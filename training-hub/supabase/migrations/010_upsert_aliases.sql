-- ============================================================
-- Merged-sheet upsert with aliases merging
-- ============================================================
-- Extends upsert_employees_from_sheet() (from migration 007) so
-- it also merges any incoming aliases[] into the existing array,
-- deduplicated. Each incoming row can now carry an "aliases" JSON
-- array and the RPC will union it with whatever's already stored
-- on the matched employee.
--
-- This is what lets the Google Sheets merged-sheet sync auto-
-- register legal-name / preferred-name / quoted-nickname aliases
-- for every row it pushes — no manual fix-sheet step needed.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_employees_from_sheet(emps jsonb)
RETURNS TABLE (id uuid, last_name text, first_name text)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO employees (last_name, first_name, is_active, department, hire_date, employee_number, aliases)
  SELECT
    (e->>'last_name')::text,
    (e->>'first_name')::text,
    COALESCE((e->>'is_active')::boolean, true),
    NULLIF(e->>'department', '')::text,
    NULLIF(e->>'hire_date', '')::date,
    NULLIF(e->>'employee_number', '')::text,
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(e->'aliases', '[]'::jsonb))),
      '{}'::text[]
    )
  FROM jsonb_array_elements(emps) AS e
  ON CONFLICT ((lower(employees.last_name)), (lower(employees.first_name))) DO UPDATE SET
    is_active       = EXCLUDED.is_active,
    department      = EXCLUDED.department,
    hire_date       = EXCLUDED.hire_date,
    employee_number = COALESCE(EXCLUDED.employee_number, employees.employee_number),
    aliases         = ARRAY(
      SELECT DISTINCT unnest(employees.aliases || EXCLUDED.aliases)
    ),
    updated_at      = now()
  RETURNING employees.id, employees.last_name, employees.first_name;
END;
$$;
