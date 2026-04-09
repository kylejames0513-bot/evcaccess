-- ============================================================
-- Excusals source tracking
-- ============================================================
-- Lets each sync workflow wipe only its own excusals without
-- clobbering rows owned by other workflows (manual HR entry,
-- board_excuse, bulk_excuse, etc.).
--
-- Before this column existed, pushMergedToSupabase was deleting
-- ALL training_records and ALL excusals on every run, destroying
-- merged-sheet completion data whenever the Training Records
-- sheet sync ran afterward.
-- ============================================================

ALTER TABLE excusals
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- Backfill existing rows that almost certainly came from the
-- merged-sheet sync (before this column existed).
UPDATE excusals SET source = 'merged_sheet' WHERE source = 'manual';
