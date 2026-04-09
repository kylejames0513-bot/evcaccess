-- ============================================================
-- Employee name unique constraint
-- ============================================================
-- Adds a unique constraint on (last_name, first_name) so PostgREST
-- has a real conflict target for upsert. Without this, the Google
-- Sheets merged-sheet sync creates a fresh UUID for every employee
-- on every run instead of updating the existing row — which in turn
-- orphans their training_records when the post-insert employee
-- lookup collides on duplicate name keys.
--
-- If you already have duplicate employees from earlier broken runs,
-- dedupe them before applying this (merge training_records, excusals,
-- and enrollments into the oldest row, then delete the duplicates).
-- ============================================================

ALTER TABLE employees
  ADD CONSTRAINT employees_name_unique
  UNIQUE (last_name, first_name);
