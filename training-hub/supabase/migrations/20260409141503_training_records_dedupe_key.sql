
-- Fix #2: give training_records a real conflict target so
-- ON CONFLICT DO NOTHING works (inside apply_auto_fill) and
-- re-running the sheet sync doesn't create duplicate rows
-- for the same person + training + date.
CREATE UNIQUE INDEX IF NOT EXISTS training_records_emp_type_date_unique
  ON training_records (employee_id, training_type_id, completion_date);
