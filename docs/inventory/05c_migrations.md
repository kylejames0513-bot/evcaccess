# 05c Migrations (part 3 of 4)

## 004_record_review_columns.sql

```sql
-- Restores fields used by the /records page's review workflow:
-- pass/fail gating, reviewer name, arrival/end times, session length,
-- left-early flag, and left-early reason.
ALTER TABLE training_records
  ADD COLUMN IF NOT EXISTS pass_fail      TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by    TEXT,
  ADD COLUMN IF NOT EXISTS arrival_time   TEXT,
  ADD COLUMN IF NOT EXISTS end_time       TEXT,
  ADD COLUMN IF NOT EXISTS session_length TEXT,
  ADD COLUMN IF NOT EXISTS left_early     TEXT,
  ADD COLUMN IF NOT EXISTS reason         TEXT;

-- Partial index for "pending review" filter on /records
CREATE INDEX IF NOT EXISTS idx_records_pending_review
  ON training_records ((pass_fail IS NULL OR lower(pass_fail) = 'pending'))
  WHERE pass_fail IS NULL OR lower(pass_fail) = 'pending';
```

## 005_employee_name_unique.sql

```sql
-- Adds a unique constraint on (last_name, first_name) so PostgREST
-- has a real conflict target for upsert. Without this, the Google
-- Sheets merged-sheet sync creates a fresh UUID for every employee on
-- every run instead of updating the existing row, which in turn orphans
-- their training_records when the post-insert employee lookup collides
-- on duplicate name keys.
ALTER TABLE employees
  ADD CONSTRAINT employees_name_unique
  UNIQUE (last_name, first_name);
```

## 006_employee_number.sql

```sql
-- Adds a column for the HR-assigned employee ID (Paylocity or internal).
-- Distinct from the UUID primary key. This is the number that shows on
-- their badge and that HR uses day-to-day.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_number TEXT;

-- Partial unique index: every assigned number must be unique, but NULL
-- is allowed for rows that haven't been assigned one.
CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_number_unique
  ON employees (employee_number)
  WHERE employee_number IS NOT NULL;
```

## 006_fix_auto_fill_recursion.sql

```sql
-- Fix 1: bail early when the row was itself inserted by the trigger
-- (source = 'auto_fill'). Breaks the MED_TRAIN <-> POST MED cycle.
-- Fix 2: add unique index on (employee_id, training_type_id, completion_date)
-- so the ON CONFLICT DO NOTHING actually has a conflict target, and so
-- re-running the sync doesn't duplicate the same person + training + date.
CREATE OR REPLACE FUNCTION apply_auto_fill()
RETURNS TRIGGER AS $$
DECLARE
  rule RECORD;
BEGIN
  IF NEW.source = 'auto_fill' THEN
    RETURN NEW;
  END IF;

  FOR rule IN
    SELECT afr.target_type_id, afr.offset_days
    FROM auto_fill_rules afr
    WHERE afr.source_type_id = NEW.training_type_id
  LOOP
    INSERT INTO training_records (employee_id, training_type_id, completion_date, session_id, source)
    VALUES (
      NEW.employee_id,
      rule.target_type_id,
      NEW.completion_date + rule.offset_days,
      NEW.session_id,
      'auto_fill'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE UNIQUE INDEX IF NOT EXISTS training_records_emp_type_date_unique
  ON training_records (employee_id, training_type_id, completion_date);
```

## 007_upsert_employees_rpc.sql

```sql
-- Bulk-upsert RPC for the Google Sheets merged-sheet sync.
-- PostgREST's on_conflict=col1,col2 query string can't target a
-- functional unique index (employees_name_unique_ci on
-- lower(last_name), lower(first_name)). Per-row PATCH from Apps
-- Script was taking 15+ minutes for ~2200 employees and blowing
-- through the 6-minute Apps Script execution limit.
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
```

Heads up: the ON CONFLICT clause in 007 targets `(lower(last_name), lower(first_name))`, which is a functional index, but migration 005 creates a plain `UNIQUE (last_name, first_name)` constraint, not a case insensitive one. There is no migration creating `employees_name_unique_ci` in the repo, so this RPC will error unless that functional index already exists on the live DB from some other source. Flag for Step 1 verification.
