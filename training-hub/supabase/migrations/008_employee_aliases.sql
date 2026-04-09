-- ============================================================
-- Per-employee full-name aliases
-- ============================================================
-- Bridges legal name vs preferred name mismatches (e.g. an
-- employee who's on the Training sheet as "Cindy Thompson" but
-- signs the QR-scan Training Records sheet as "Mary Thompson"
-- because Mary is her legal name on the badge).
--
-- Aliases are free-form full-name strings. The Apps Script
-- training-records matcher loads them and indexes each entry
-- as a full-alias lookup key, and auto-appends a new entry
-- whenever a fix-sheet canonical name successfully resolves.
-- ============================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

-- GIN index for fast alias → employee lookups server-side.
CREATE INDEX IF NOT EXISTS idx_employees_aliases
  ON employees USING GIN (aliases);

-- Helper RPC: add an alias to an employee's aliases array without
-- duplicating. Called by the Apps Script after it resolves a name
-- via the fix sheet so the mapping sticks in Supabase.
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
