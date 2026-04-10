
-- Track where each excusal came from so the merged-sheet sync can
-- wipe only its own entries without clobbering manual entries or
-- board_excuse / bulk_excuse workflow data.
ALTER TABLE excusals
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- Backfill existing rows that almost certainly came from the
-- merged-sheet sync (before this column existed).
UPDATE excusals SET source = 'merged_sheet' WHERE source = 'manual';
