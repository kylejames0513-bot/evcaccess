-- Cutover Stage 3: seed required_trainings from the legacy hub_settings
-- dept_rule rows. CPR/FA is universal (every active employee). The
-- per-department rules are the additional trainings beyond CPR.

INSERT INTO required_trainings (training_type_id, department, position, is_required, is_universal, notes)
VALUES
  (1, NULL, NULL, true, true, 'CPR/FA universal: every active employee.')
ON CONFLICT DO NOTHING;

INSERT INTO required_trainings (training_type_id, department, position, is_required, is_universal, notes)
VALUES
  (3, 'Behavioral Health',     NULL, true, false, 'Seeded from hub_settings dept_rule.'),
  (2, 'Behavioral Health',     NULL, true, false, 'Seeded from hub_settings dept_rule.'),
  (2, 'Executive',             NULL, true, false, 'Seeded from hub_settings dept_rule.'),
  (2, 'Family Support',        NULL, true, false, 'Seeded from hub_settings dept_rule.'),
  (2, 'Finance',               NULL, true, false, 'Seeded from hub_settings dept_rule.'),
  (2, 'Human Resources',       NULL, true, false, 'Seeded from hub_settings dept_rule.'),
  (39, 'Human Resources',      NULL, true, false, 'Seeded from hub_settings dept_rule.'),
  (3, 'Residential',           NULL, true, false, 'Seeded from hub_settings dept_rule.'),
  (4, 'Residential',           NULL, true, false, 'Seeded from hub_settings dept_rule. Med Recert is the renewable form.'),
  (6, 'Residential',           NULL, true, false, 'Seeded from hub_settings dept_rule.'),
  (2, 'Residential',           NULL, true, false, 'Seeded from hub_settings dept_rule.'),
  (2, 'Workforce Innovation',  NULL, true, false, 'Seeded from hub_settings dept_rule.')
ON CONFLICT DO NOTHING;
