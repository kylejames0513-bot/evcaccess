-- Replace the dept_rule rows in hub_settings with a real relational table.
-- Supports three matching modes: universal (every active employee),
-- department scoped, and department + position scoped. The compliance view
-- in a later migration joins this table to determine what each employee
-- needs.
--
-- Key constraints:
--   - is_universal=true means department and position are both NULL.
--   - department NOT NULL means the rule applies to every employee in that
--     department whose position matches (or whose position is anything if
--     position is NULL).
--   - The CHECK constraint enforces this so a malformed row can't sneak in.
--
-- Uniqueness: one row per (training_type, department, position). NULL
-- values are coalesced to the empty string for the unique index so two
-- "department only" rows for the same training in the same dept collide.

CREATE TABLE IF NOT EXISTS required_trainings (
  id               SERIAL PRIMARY KEY,
  training_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  department       TEXT,
  position         TEXT,
  is_required      BOOLEAN NOT NULL DEFAULT true,
  is_universal     BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT required_trainings_universal_xor_dept
    CHECK (
      (is_universal = true AND department IS NULL AND position IS NULL)
      OR
      (is_universal = false AND department IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS required_trainings_unique
  ON required_trainings (
    training_type_id,
    COALESCE(lower(department), ''),
    COALESCE(lower(position), '')
  );

CREATE INDEX IF NOT EXISTS idx_required_trainings_dept
  ON required_trainings (lower(department))
  WHERE department IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_required_trainings_universal
  ON required_trainings (is_universal)
  WHERE is_universal = true;

CREATE TRIGGER trg_required_trainings_updated_at
  BEFORE UPDATE ON required_trainings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE required_trainings IS
  'Per-training requirement rules. Replaces the dept_rule rows in hub_settings.';
