
-- Extend the merged-sheet upsert RPC to also merge incoming aliases
-- into the existing aliases[] array (deduplicated). Each incoming
-- row's aliases are provided as a JSON array of strings.
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
