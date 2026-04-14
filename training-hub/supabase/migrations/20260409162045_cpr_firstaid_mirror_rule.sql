
-- Mirror rule: CPR training completion auto records First Aid on
-- the same day. Safe now that apply_auto_fill() skips rows whose
-- source = 'auto_fill' (the recursion fix from earlier).
DO $$
DECLARE
  cpr_id INT;
  fa_id  INT;
BEGIN
  SELECT id INTO cpr_id FROM training_types WHERE column_key = 'CPR';
  SELECT id INTO fa_id  FROM training_types WHERE column_key = 'FIRSTAID';

  IF cpr_id IS NOT NULL AND fa_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auto_fill_rules
      WHERE source_type_id = cpr_id
        AND target_type_id = fa_id
        AND offset_days = 0
    ) THEN
      INSERT INTO auto_fill_rules (source_type_id, target_type_id, offset_days)
      VALUES (cpr_id, fa_id, 0);
    END IF;
  END IF;
END $$;
