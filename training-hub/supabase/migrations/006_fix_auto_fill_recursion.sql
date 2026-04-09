-- ============================================================
-- Fix auto_fill recursion + add training_records dedupe key
-- ============================================================
-- Two related bugs that combined to blow the Postgres stack depth
-- every time the Google Sheets merged-sheet sync tried to insert a
-- MED_TRAIN or POST MED training record.
--
-- Bug 1: auto_fill_rules has a bidirectional cycle
--   MED_TRAIN → POST MED  (offset +1)
--   POST MED → MED_TRAIN  (offset -1)
-- The apply_auto_fill trigger fires AFTER INSERT, runs the rule,
-- and inserts the target row. That target insert fires the trigger
-- again, which inserts the *original* source row back (at a ±1 day
-- offset), which fires the trigger again, forever. The trigger's
-- ON CONFLICT DO NOTHING clause was a no-op because there was no
-- unique constraint on training_records for it to conflict against.
--
-- Fix 1: make apply_auto_fill bail early when the row it's reacting
-- to was itself inserted by the trigger (source = 'auto_fill').
-- This breaks the cycle after the first propagation.
--
-- Fix 2: add a unique index on (employee_id, training_type_id,
-- completion_date) so the ON CONFLICT DO NOTHING actually has a
-- conflict target, AND so re-running the sync doesn't duplicate
-- the same person + training + date rows.
-- ============================================================

CREATE OR REPLACE FUNCTION apply_auto_fill()
RETURNS TRIGGER AS $$
DECLARE
  rule RECORD;
BEGIN
  -- Don't cascade: rows we inserted ourselves shouldn't spawn more auto-fills.
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
