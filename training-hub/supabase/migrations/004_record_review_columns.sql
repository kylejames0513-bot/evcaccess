-- ============================================================
-- Training Records review columns
-- ============================================================
-- Restores fields used by the /records page's review workflow:
-- pass/fail gating, reviewer name, arrival/end times, session
-- length, left-early flag, and left-early reason.
--
-- These were referenced by the original Google-Sheets-era code but
-- never made it into 001_initial_schema.sql. Adding them back as
-- nullable so existing rows are untouched.
-- ============================================================

ALTER TABLE training_records
  ADD COLUMN IF NOT EXISTS pass_fail      TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by    TEXT,
  ADD COLUMN IF NOT EXISTS arrival_time   TEXT,
  ADD COLUMN IF NOT EXISTS end_time       TEXT,
  ADD COLUMN IF NOT EXISTS session_length TEXT,
  ADD COLUMN IF NOT EXISTS left_early     TEXT,
  ADD COLUMN IF NOT EXISTS reason         TEXT;

-- Partial index to speed up the "pending review" filter on /records
CREATE INDEX IF NOT EXISTS idx_records_pending_review
  ON training_records ((pass_fail IS NULL OR lower(pass_fail) = 'pending'))
  WHERE pass_fail IS NULL OR lower(pass_fail) = 'pending';
