-- Step 1 schema-drift fixes, per docs/MIGRATION_DRIFT.md section
-- "Known leftover issues that this regen does NOT fix".
--
-- 1. employees has TWO functionally identical case-insensitive unique
--    indexes: employees_name_unique_ci and idx_employees_unique_name.
--    Drop the older/redundant one.
--
-- 2. training_types.column_key is used as a lookup key in
--    cpr_firstaid_mirror_rule and in multiple upsert RPCs but has no
--    unique constraint. Add one so ON CONFLICT (column_key) becomes
--    a valid target and lookups can't silently pick the wrong row
--    when duplicate column_key values exist.
--
-- 3. unknown_trainings and unresolved_people should record resolved_by
--    for audit; unknown_trainings already has the column, unresolved_people
--    did not.
--
-- This migration is written to be idempotent (IF EXISTS / IF NOT EXISTS)
-- so it can be run on any environment that already has partial state.

-- ── 1. Drop the redundant employees unique index ──────────────────────
-- idx_employees_unique_name predates employees_name_unique_ci. Both enforce
-- lower(first_name || ' ' || last_name) uniqueness. Keep the CI-named one
-- since migration 20260409144927 (the canonical source).
DROP INDEX IF EXISTS public.idx_employees_unique_name;

-- ── 2. training_types.column_key must be unique ───────────────────────
-- First: collapse any duplicates defensively. If two rows share column_key,
-- keep the lowest-id row (oldest) and reassign all training_records /
-- training_aliases / required_trainings references to it, then delete
-- the dupes. No-op when column_key is already unique.
DO $$
DECLARE
  dupe_key TEXT;
  keep_id INT;
BEGIN
  FOR dupe_key IN
    SELECT column_key
    FROM training_types
    WHERE column_key IS NOT NULL
    GROUP BY column_key
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keep_id
    FROM training_types
    WHERE column_key = dupe_key
    ORDER BY id ASC
    LIMIT 1;

    UPDATE training_records
       SET training_type_id = keep_id
     WHERE training_type_id IN (
       SELECT id FROM training_types
        WHERE column_key = dupe_key AND id <> keep_id
     );

    UPDATE training_aliases
       SET training_type_id = keep_id
     WHERE training_type_id IN (
       SELECT id FROM training_types
        WHERE column_key = dupe_key AND id <> keep_id
     );

    UPDATE required_trainings
       SET training_type_id = keep_id
     WHERE training_type_id IN (
       SELECT id FROM training_types
        WHERE column_key = dupe_key AND id <> keep_id
     );

    DELETE FROM training_types
     WHERE column_key = dupe_key AND id <> keep_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS training_types_column_key_unique
  ON training_types (column_key)
  WHERE column_key IS NOT NULL;

-- NOTE: unresolved_people and unknown_trainings both already include
-- resolved_by / resolved_at columns (see 20260410024958_unresolved_people_table
-- and 20260410025015_unknown_trainings_table). No audit-trail column changes
-- needed here, but the resolution RPCs in application code MUST start
-- populating resolved_by with the authenticated auth.users.id.
