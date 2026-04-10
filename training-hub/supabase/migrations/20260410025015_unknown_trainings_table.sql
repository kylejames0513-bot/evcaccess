-- Review queue for import rows whose training name could not be matched
-- to a training_types row (or to a training_aliases row pointing at one).
-- Per Kyle's rule: do not invent training names. Anything we can't classify
-- lands here for human review.
--
-- One row per (import, source, raw_name) combo. occurrence_count tracks
-- how many import rows in the same upload had this same unrecognized
-- name, so the reviewer can fix high-impact entries first.
--
-- Resolution writes a new training_aliases row pointing raw_name at the
-- chosen training_type, marks this row resolved, and (in the resolver)
-- backfills any historical training_records that were skipped because of
-- this unknown training.

CREATE TABLE IF NOT EXISTS unknown_trainings (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id                    UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  source                       TEXT NOT NULL,
  raw_name                     TEXT NOT NULL,
  raw_payload                  JSONB NOT NULL,
  occurrence_count             INT NOT NULL DEFAULT 1,
  suggested_training_type_id   INT REFERENCES training_types(id),
  resolved_at                  TIMESTAMPTZ,
  resolved_by                  UUID REFERENCES auth.users(id),
  resolved_to_training_type_id INT REFERENCES training_types(id),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unknown_trainings_source_check
    CHECK (source IN ('paylocity', 'phs', 'access', 'signin', 'manual', 'cutover'))
);

CREATE UNIQUE INDEX IF NOT EXISTS unknown_trainings_unique
  ON unknown_trainings (import_id, source, lower(raw_name));

CREATE INDEX IF NOT EXISTS idx_unknown_trainings_open
  ON unknown_trainings (created_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE unknown_trainings IS
  'Review queue for import rows whose training name could not be matched.';
