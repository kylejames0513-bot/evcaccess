-- Full per-employee training audit trail. Used by the employee detail
-- page (target feature 7.6) including for terminated employees, since
-- this view does NOT filter by is_active.
--
-- One row per training_record, joined with the training name and the
-- employee identity. Sorted newest completion first by default; consumers
-- can re-sort.

CREATE OR REPLACE VIEW employee_history AS
SELECT
  e.id           AS employee_id,
  e.first_name,
  e.last_name,
  e.paylocity_id,
  e.is_active,
  e.terminated_at,
  e.reactivated_at,
  e.department,
  e.position,
  e.job_title,
  tr.id          AS training_record_id,
  tr.training_type_id,
  tt.name        AS training_name,
  tt.column_key  AS training_column_key,
  tt.renewal_years,
  tr.completion_date,
  tr.expiration_date,
  tr.source,
  tr.notes,
  tr.pass_fail,
  tr.reviewed_by,
  tr.created_at  AS recorded_at
FROM training_records tr
JOIN employees e      ON e.id = tr.employee_id
JOIN training_types tt ON tt.id = tr.training_type_id;

COMMENT ON VIEW employee_history IS
  'Full per-employee training audit trail across every source. Includes '
  'terminated employees. One row per training_records row.';
