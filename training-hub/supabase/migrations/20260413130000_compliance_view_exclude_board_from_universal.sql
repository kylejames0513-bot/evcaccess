-- Exclude Board department from universal required trainings.
--
-- Board members are listed in the employees table (department='Board')
-- so the compliance view picks them up as active staff, but they are
-- not subject to universal staff trainings (CPR, etc). Universal rules
-- should still apply to everyone else; department- and position-scoped
-- rules still apply when an operator explicitly targets 'Board'.
--
-- Implementation: add `AND lower(e.department) <> 'board'` to the
-- universal branch of the JOIN LATERAL subquery. Everything else in
-- the view is copied verbatim from
-- 20260410040000_compliance_view_column_key_match.sql.

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
      AND lower(coalesce(e.department, '')) <> 'board'
    )
    OR (
      rt_inner.department IS NOT NULL
      AND lower(rt_inner.department) = lower(e.department)
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
LEFT JOIN excusals exc
  ON exc.employee_id = e.id
 AND exc.training_type_id = tt.id
WHERE e.is_active = true
  AND rt.is_required = true;

COMMENT ON VIEW employee_compliance IS
  'Compliance status per (active employee, required training). '
  'Board department is excluded from universal rules but still '
  'receives any Board-scoped department/position rules. '
  'Completions matched by column_key so Initial Med satisfies Med Recert.';
