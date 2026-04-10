-- Replace the employee_compliance view with one that joins
-- required_trainings instead of training_types.is_required, uses a 30 day
-- DUE_SOON window instead of 60, and exposes the 90/60/30/overdue tier
-- columns the dashboard needs.
--
-- Existing column set is preserved as a strict superset so older API
-- routes that select specific columns from this view do not break.
-- New columns: due_in_90, due_in_60, due_in_30, days_overdue, source.
--
-- Status enum stays the same five values (current, expiring_soon,
-- expired, needed, excused). Semantics:
--   excused        : an excusals row exists for this (employee, training)
--   needed         : the requirement applies but no completion exists
--   expired        : completion exists but expiration_date < today
--   expiring_soon  : expiration_date is within 30 days of today
--   current        : everything else, including one-and-done trainings
--                    (renewal_years = 0) that have any completion
--
-- The required_trainings join uses the most-specific match: position-level
-- override beats department-level which beats universal. Implemented as a
-- LEFT JOIN LATERAL subquery so we can pick the winning row per (employee,
-- training) tuple.
--
-- Filter: e.is_active = true. Terminated employees are deliberately
-- excluded from this view per Kyle's rule. Use the employee_history view
-- for terminated employees.

DROP VIEW IF EXISTS employee_compliance;

CREATE VIEW employee_compliance AS
SELECT
  e.id           AS employee_id,
  e.first_name,
  e.last_name,
  e.job_title,
  e.department,
  e.position,
  e.program,
  e.paylocity_id,
  tt.id          AS training_type_id,
  tt.name        AS training_name,
  tt.renewal_years,
  rt.is_required,
  latest.completion_date,
  latest.expiration_date,
  latest.source  AS completion_source,
  exc.reason     AS excusal_reason,
  -- 90/60/30/overdue tier columns
  CASE
    WHEN latest.expiration_date IS NULL THEN NULL
    WHEN latest.expiration_date < CURRENT_DATE THEN (CURRENT_DATE - latest.expiration_date)
    ELSE NULL
  END::INT       AS days_overdue,
  CASE
    WHEN latest.expiration_date IS NULL THEN false
    WHEN latest.expiration_date < CURRENT_DATE THEN false
    WHEN latest.expiration_date <= CURRENT_DATE + INTERVAL '30 days' THEN true
    ELSE false
  END            AS due_in_30,
  CASE
    WHEN latest.expiration_date IS NULL THEN false
    WHEN latest.expiration_date <= CURRENT_DATE + INTERVAL '60 days'
     AND latest.expiration_date > CURRENT_DATE + INTERVAL '30 days' THEN true
    ELSE false
  END            AS due_in_60,
  CASE
    WHEN latest.expiration_date IS NULL THEN false
    WHEN latest.expiration_date <= CURRENT_DATE + INTERVAL '90 days'
     AND latest.expiration_date > CURRENT_DATE + INTERVAL '60 days' THEN true
    ELSE false
  END            AS due_in_90,
  CASE
    WHEN exc.id IS NOT NULL THEN 'excused'
    WHEN latest.completion_date IS NULL THEN 'needed'
    WHEN tt.renewal_years = 0 THEN 'current'
    WHEN latest.expiration_date < CURRENT_DATE THEN 'expired'
    WHEN latest.expiration_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'current'
  END::compliance_status AS status
FROM employees e
JOIN LATERAL (
  -- Pick the most specific required_trainings rule that applies to this
  -- employee: position match > department match > universal.
  SELECT rt_inner.training_type_id, rt_inner.is_required
  FROM required_trainings rt_inner
  WHERE
    (rt_inner.is_universal = true)
    OR (
      rt_inner.department IS NOT NULL
      AND lower(rt_inner.department) = lower(e.department)
      AND (
        rt_inner.position IS NULL
        OR (e.position IS NOT NULL AND lower(rt_inner.position) = lower(e.position))
      )
    )
  ORDER BY
    -- More specific rules win (position > department > universal)
    (rt_inner.position IS NOT NULL)::INT DESC,
    (rt_inner.department IS NOT NULL)::INT DESC,
    rt_inner.id ASC
) rt ON true
JOIN training_types tt ON tt.id = rt.training_type_id AND tt.is_active = true
LEFT JOIN LATERAL (
  SELECT tr.completion_date, tr.expiration_date, tr.source
  FROM training_records tr
  WHERE tr.employee_id = e.id
    AND tr.training_type_id = tt.id
  ORDER BY tr.completion_date DESC
  LIMIT 1
) latest ON true
LEFT JOIN excusals exc
  ON exc.employee_id = e.id
 AND exc.training_type_id = tt.id
WHERE e.is_active = true
  AND rt.is_required = true;

COMMENT ON VIEW employee_compliance IS
  'Compliance status per (active employee, required training). 30 day '
  'expiring_soon window. Includes 90/60/30/overdue tier columns and '
  'completion source for provenance. Terminated employees excluded.';
