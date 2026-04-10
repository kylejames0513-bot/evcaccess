
ALTER TABLE training_records
  ADD COLUMN IF NOT EXISTS pass_fail      TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by    TEXT,
  ADD COLUMN IF NOT EXISTS arrival_time   TEXT,
  ADD COLUMN IF NOT EXISTS end_time       TEXT,
  ADD COLUMN IF NOT EXISTS session_length TEXT,
  ADD COLUMN IF NOT EXISTS left_early     TEXT,
  ADD COLUMN IF NOT EXISTS reason         TEXT;

CREATE INDEX IF NOT EXISTS idx_records_pending_review
  ON training_records ((pass_fail IS NULL OR lower(pass_fail) = 'pending'))
  WHERE pass_fail IS NULL OR lower(pass_fail) = 'pending';
