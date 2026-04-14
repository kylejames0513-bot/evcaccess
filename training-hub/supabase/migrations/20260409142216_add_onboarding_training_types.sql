
-- Add training types that showed up in the Training Records sheet
-- but had no matching row in Supabase. "Other" and "3 Phase" are
-- ambiguous, so they're intentionally skipped.
INSERT INTO training_types (name, column_key, renewal_years, is_required, class_capacity, is_active)
VALUES
  ('Orientation',      'ORIENTATION', 0, false, 20, true),
  ('Manager Training', 'MANAGER',     0, false, 15, true),
  ('Job Description',  'JOB_DESC',    0, false, 15, true),
  ('Relias',           'RELIAS',      0, false, 50, true)
ON CONFLICT (name) DO NOTHING;

-- Aliases so "New Employee Orientation" matches the "Orientation" row
INSERT INTO training_aliases (training_type_id, alias)
SELECT id, a.alias
FROM training_types tt
CROSS JOIN LATERAL (VALUES
  ('Orientation',      'New Employee Orientation'),
  ('Orientation',      'new hire orientation'),
  ('Orientation',      'onboarding'),
  ('Manager Training', 'management training'),
  ('Manager Training', 'supervisor training'),
  ('Job Description',  'Job Desc'),
  ('Job Description',  'job description review')
) AS a(tt_name, alias)
WHERE tt.name = a.tt_name
ON CONFLICT (alias) DO NOTHING;
