-- Track which import source taught us each training alias. Lets the
-- resolver in step 2.5 prefer source-specific aliases when matching, and
-- lets the resolution review UI in step 2.11 explain "this alias was
-- learned from a Paylocity import" to the human.
--
-- Backfills every existing row to source='manual'. The unique constraint
-- on alias stays unchanged: one alias points to exactly one training
-- regardless of which source first introduced it.

ALTER TABLE training_aliases
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

UPDATE training_aliases SET source = 'manual' WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_training_aliases_source
  ON training_aliases (source);

COMMENT ON COLUMN training_aliases.source IS
  'Where this alias was learned. One of: manual, paylocity, phs, access, signin.';
