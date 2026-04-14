-- Fix the employee_compliance view to:
--   1. Match required_trainings.department against employees.division
--      (with fallback to employees.department for employees who don't
--      have a division set yet).
--   2. Match excusals by column_key as well as exact training_type_id,
--      so excusing "Initial Med Training" also excuses "Med Recert"
--      (and vice versa). The compliance view already matches
--      completions by column_key for the same reason; the excusal
--      side was lagging behind.
--
-- See 20260414000000_employees_division_column.sql for the full
-- background on the division/department mismatch. In short:
-- required_trainings rules are keyed by division name ("Residential"),
-- but employees.department held the sub-unit name ("Tiffin"), so the
-- old join silently matched nothing for most staff.
--
-- The view body is otherwise copied verbatim from
-- 20260413130000_compliance_view_exclude_board_from_universal.sql with
-- two changes:
--   (a) The LATERAL subquery for `rt` uses
--       lower(rt_inner.department) = lower(coalesce(e.division, e.department))
--       and the Board-exclusion check uses the same coalesced value.
--   (b) The excusals join uses a LATERAL subquery that resolves the
--       set of training_type_ids sharing tt.column_key, so an excusal
--       on any sibling training_type satisfies the requirement.

DROP VIEW IF EXISTS employee_compliance;

CREATE VIEW employee_compliance
WITH (security_invoker = true)
AS
SELECT
  e.id           AS employee_id,
  e.first_name,
  e.last_name,
  e.job_title,
  e.department,
  e.division,
  e.position,
  e.program,
  e.paylocity_id,
  tt.id          AS training_type_id,
  CASE
    WHEN latest.completion_date IS NULL
     AND tt.column_key IN (
           SELECT t2.column_key FROM training_types t2
           WHERE t2.id <> tt.id AND t2.column_key = tt.column_key
         )
    THEN (SELECT t3.name FROM training_types t3
          WHERE t3.column_key = tt.column_key AND t3.renewal_years = 0
          LIMIT 1)
    ELSE tt.name
  END            AS training_name,
  tt.renewal_years,
  rt.is_required,
  latest.completion_date,
  CASE
    WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
    THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
    ELSE latest.expiration_date
  END            AS expiration_date,
  latest.source  AS completion_source,
  exc.reason     AS excusal_reason,
  CASE
    WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
     AND (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date < CURRENT_DATE
    THEN (CURRENT_DATE - (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date)
    WHEN latest.expiration_date IS NOT NULL AND latest.expiration_date < CURRENT_DATE
    THEN (CURRENT_DATE - latest.expiration_date)
    ELSE NULL
  END::INT       AS days_overdue,
  CASE
    WHEN COALESCE(
           CASE WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
                THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
                ELSE latest.expiration_date END,
           '9999-12-31'::date
         ) <= CURRENT_DATE + INTERVAL '30 days'
     AND COALESCE(
           CASE WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
                THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
                ELSE latest.expiration_date END,
           '9999-12-31'::date
         ) >= CURRENT_DATE
    THEN true ELSE false
  END            AS due_in_30,
  CASE
    WHEN COALESCE(
           CASE WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
                THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
                ELSE latest.expiration_date END,
           '9999-12-31'::date
         ) <= CURRENT_DATE + INTERVAL '60 days'
     AND COALESCE(
           CASE WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
                THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
                ELSE latest.expiration_date END,
           '9999-12-31'::date
         ) > CURRENT_DATE + INTERVAL '30 days'
    THEN true ELSE false
  END            AS due_in_60,
  CASE
    WHEN COALESCE(
           CASE WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
                THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
                ELSE latest.expiration_date END,
           '9999-12-31'::date
         ) <= CURRENT_DATE + INTERVAL '90 days'
     AND COALESCE(
           CASE WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
                THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
                ELSE latest.expiration_date END,
           '9999-12-31'::date
         ) > CURRENT_DATE + INTERVAL '60 days'
    THEN true ELSE false
  END            AS due_in_90,
  CASE
    WHEN exc.id IS NOT NULL THEN 'excused'
    WHEN latest.completion_date IS NULL THEN 'needed'
    WHEN tt.renewal_years = 0 THEN 'current'
    WHEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date < CURRENT_DATE THEN 'expired'
    WHEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
    ELSE 'current'
  END::compliance_status AS status
FROM employees e
JOIN LATERAL (
  SELECT rt_inner.training_type_id, rt_inner.is_required
  FROM required_trainings rt_inner
  WHERE
    (
      rt_inner.is_universal = true
      AND lower(coalesce(e.division, e.department, '')) <> 'board'
    )
    OR (
      rt_inner.department IS NOT NULL
      AND lower(rt_inner.department) = lower(coalesce(e.division, e.department))
      AND (
        rt_inner.position IS NULL
        OR (e.position IS NOT NULL AND lower(rt_inner.position) = lower(e.position))
      )
    )
  ORDER BY
    (rt_inner.position IS NOT NULL)::INT DESC,
    (rt_inner.department IS NOT NULL)::INT DESC,
    rt_inner.id ASC
) rt ON true
JOIN training_types tt ON tt.id = rt.training_type_id AND tt.is_active = true
LEFT JOIN LATERAL (
  SELECT tr.completion_date, tr.expiration_date, tr.source
  FROM training_records tr
  JOIN training_types tr_tt ON tr_tt.id = tr.training_type_id
  WHERE tr.employee_id = e.id
    AND tr_tt.column_key = tt.column_key
  ORDER BY tr.completion_date DESC
  LIMIT 1
) latest ON true
LEFT JOIN LATERAL (
  -- Pick any excusal for this employee whose training_type shares the
  -- same column_key as `tt`. This makes excusals interchangeable across
  -- "Initial Med Training" and "Med Recert" (both column_key='MED_TRAIN'),
  -- mirroring the way completions are matched in the `latest` lateral.
  SELECT exc_inner.id, exc_inner.reason
  FROM excusals exc_inner
  JOIN training_types exc_tt ON exc_tt.id = exc_inner.training_type_id
  WHERE exc_inner.employee_id = e.id
    AND exc_tt.column_key = tt.column_key
  LIMIT 1
) exc ON true
WHERE e.is_active = true
  AND rt.is_required = true;

COMMENT ON VIEW employee_compliance IS
  'Compliance status per (active employee, required training). '
  'Matches required_trainings.department against employees.division '
  '(falling back to employees.department for historical rows with a '
  'null division). Board division is excluded from universal rules. '
  'Completions matched by column_key so Initial Med satisfies Med Recert.';
