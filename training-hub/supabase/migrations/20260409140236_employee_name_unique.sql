
-- Case-sensitive unique constraint on (last_name, first_name).
-- Gives PostgREST a real conflict target for upsert from the
-- Google Sheets merged-sheet sync so repeated runs stop inserting
-- duplicate rows.
ALTER TABLE employees
  ADD CONSTRAINT employees_name_unique
  UNIQUE (last_name, first_name);
