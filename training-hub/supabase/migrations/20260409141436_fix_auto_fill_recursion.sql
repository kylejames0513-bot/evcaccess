
-- Fix #1: stop apply_auto_fill from re-triggering on the rows it
-- just inserted. Without this guard, a bidirectional rule like
-- MED_TRAIN <-> POST MED recurses until the PG stack blows.
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
