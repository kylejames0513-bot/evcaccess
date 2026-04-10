
-- Two-pass upsert to handle the case where an existing employee
-- row has the same employee_number but a different first_name
-- from what the sheet now says (e.g. Michael "Mike" to Michael when
-- the Training tab's F NAME changed after an Employees-tab edit).
--
-- Pass 1: For every incoming row that carries an employee_number,
--         UPDATE the existing row with that number. This refreshes
--         last_name / first_name / department / hire_date /
--         is_active and merges aliases.
--
-- Pass 2: For incoming rows that did NOT match any existing
--         employee_number in pass 1, INSERT with the normal
--         ON CONFLICT on (lower(last_name), lower(first_name)).

CREATE OR REPLACE FUNCTION upsert_employees_from_sheet(emps jsonb)
RETURNS TABLE (id uuid, last_name text, first_name text)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Pass 1: update by employee_number
  RETURN QUERY
  UPDATE employees e
     SET last_name  = (em->>'last_name')::text,
         first_name = (em->>'first_name')::text,
         is_active  = COALESCE((em->>'is_active')::boolean, true),
         department = NULLIF(em->>'department', '')::text,
         hire_date  = NULLIF(em->>'hire_date', '')::date,
         aliases    = ARRAY(
           SELECT DISTINCT unnest(
             e.aliases ||
             COALESCE(
               ARRAY(SELECT jsonb_array_elements_text(COALESCE(em->'aliases', '[]'::jsonb))),
               '{}'::text[]
             )
           )
         ),
         updated_at = now()
    FROM jsonb_array_elements(emps) AS em
   WHERE e.employee_number IS NOT NULL
     AND e.employee_number = NULLIF(em->>'employee_number', '')
  RETURNING e.id, e.last_name, e.first_name;

  -- Pass 2: insert/upsert-by-name for rows whose employee_number
  --         didn't match anything in pass 1
  RETURN QUERY
  INSERT INTO employees (last_name, first_name, is_active, department, hire_date, employee_number, aliases)
  SELECT
    (em->>'last_name')::text,
    (em->>'first_name')::text,
    COALESCE((em->>'is_active')::boolean, true),
    NULLIF(em->>'department', '')::text,
    NULLIF(em->>'hire_date', '')::date,
    NULLIF(em->>'employee_number', '')::text,
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(em->'aliases', '[]'::jsonb))),
      '{}'::text[]
    )
  FROM jsonb_array_elements(emps) AS em
  WHERE NULLIF(em->>'employee_number', '') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM employees e2
        WHERE e2.employee_number IS NOT NULL
          AND e2.employee_number = NULLIF(em->>'employee_number', '')
     )
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
