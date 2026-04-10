# 05d Migrations (part 4 of 4)

## 008_employee_aliases.sql

```sql
-- Bridges legal name vs preferred name mismatches (e.g. an employee
-- who's on the Training sheet as "Cindy Thompson" but signs the
-- QR-scan Training Records sheet as "Mary Thompson").
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_employees_aliases
  ON employees USING GIN (aliases);

-- Helper RPC: add an alias to an employee's aliases array without duplicating.
CREATE OR REPLACE FUNCTION add_employee_alias(emp_id uuid, new_alias text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE employees
     SET aliases = ARRAY(SELECT DISTINCT unnest(aliases || ARRAY[new_alias]))
   WHERE id = emp_id
     AND new_alias IS NOT NULL
     AND new_alias <> '';
$$;
```

## 009_excusals_source.sql

```sql
-- Lets each sync workflow wipe only its own excusals without clobbering
-- rows owned by other workflows. Before this column existed,
-- pushMergedToSupabase was deleting ALL training_records and ALL
-- excusals on every run, destroying merged-sheet completion data
-- whenever the Training Records sheet sync ran afterward.
ALTER TABLE excusals
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- Backfill existing rows that almost certainly came from the
-- merged-sheet sync (before this column existed).
UPDATE excusals SET source = 'merged_sheet' WHERE source = 'manual';
```

## 010_upsert_aliases.sql

```sql
-- Extends upsert_employees_from_sheet() so it also merges any incoming
-- aliases[] into the existing array, deduplicated.
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
```

## 011_upsert_by_employee_number.sql

```sql
-- Two-pass upsert_employees_from_sheet: resolve by number first, then
-- by name. Fixes the case where Training tab's F NAME changes between
-- runs and the prior single-pass RPC couldn't find the existing row.
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
```

End of migrations. Name is still the effective join key in the current RPC path; `employee_number` (Paylocity ID) is used only as a first pass lookup. This matches the brief's "past attempt" complaint and is something the rework should address.
