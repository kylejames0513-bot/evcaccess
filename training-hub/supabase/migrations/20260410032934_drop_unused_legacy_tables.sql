-- Drop legacy tables that were either always empty or have been
-- replaced by the rework. Confirmed via SELECT count(*) before drop:
--   archived_sessions  : 0 rows
--   training_schedules : 0 rows
--   removal_log        : 0 rows
--   notifications      : 0 rows
--   training_rules     : 0 rows  (replaced by required_trainings)
-- nicknames is intentionally kept (184 rows of legacy nickname pairs).
DROP TABLE IF EXISTS archived_sessions;
DROP TABLE IF EXISTS training_schedules;
DROP TABLE IF EXISTS removal_log;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS training_rules;

-- Drop the duplicate functional unique index. employees_name_unique_ci
-- and idx_employees_unique_name had identical definitions; keep
-- employees_name_unique_ci which is referenced by the upsert RPCs.
DROP INDEX IF EXISTS idx_employees_unique_name;
