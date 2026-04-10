
INSERT INTO training_types (name, column_key, renewal_years, is_required, class_capacity, is_active)
VALUES ('VR', 'VR', 0, false, 15, true)
ON CONFLICT (name) DO NOTHING;
