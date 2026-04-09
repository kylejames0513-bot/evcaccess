-- ============================================================
-- EVC Training Hub — Seed Data
-- ============================================================
-- Idempotent seed for training_types, training_aliases, nicknames,
-- and auto_fill_rules. Safe to re-run.
--
-- The full set of training_types / aliases / nicknames is the same
-- data already pushed by the existing TypeScript config:
--   src/config/trainings.ts          (TRAINING_DEFINITIONS, AUTO_FILL_RULES)
--   src/config/primary-trainings.ts  (PRIMARY_TRAININGS)
--
-- For a fresh project, use the Apps Script "Supabase Sync" menu
-- to push training types, aliases, and nicknames from the existing
-- Hub Settings sheet. This file ensures that any rows known to be
-- required (e.g., First Aid) exist even before that sync runs.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- First Aid (column_key = FIRSTAID)
-- Required for the CPR/FA mirror logic in auto_fill_rules.
-- ────────────────────────────────────────────────────────────
INSERT INTO training_types (
  name, column_key, renewal_years, is_required, class_capacity,
  only_expired, only_needed, is_active
)
VALUES (
  'First Aid', 'FIRSTAID', 2, true, 10,
  false, false, true
)
ON CONFLICT (column_key) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- Mirror rule: CPR completion → also record First Aid same day
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- Note: Full seed of training_types / training_aliases / nicknames
-- is performed by the Apps Script "Supabase Sync" workflow against
-- TRAINING_DEFINITIONS in src/config/trainings.ts. Run that menu
-- once on a fresh database to populate the remaining rows.
-- ────────────────────────────────────────────────────────────
