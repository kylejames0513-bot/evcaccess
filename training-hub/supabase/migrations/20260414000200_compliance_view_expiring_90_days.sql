-- Widen the expiring_soon window from 30 days to 90 days.
--
-- The original plan (docs/PLAN.md) used 30 days for expiring_soon to
-- match the brief's 30/60/90/overdue notification ladder, but in
-- practice HR wants the dashboard's "Expiring Soon" tile to surface
-- every certification that's expiring in the next quarter, not just
-- the next month. 30 days was way too narrow — most certs that need
-- renewal scheduling get noticed at the 60-90 day mark.
--
-- This migration is a straight copy of 20260414000100 with the only
-- change being that the `status` CASE now uses INTERVAL '90 days'
-- instead of INTERVAL '30 days' for the expiring_soon branch.
--
-- The due_in_30 / due_in_60 / due_in_90 boolean tier columns are
-- preserved unchanged so the notification ladder still has its
-- finer granularity for alert routing.

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
    -- WIDENED from 30 → 90 days: HR wants the dashboard to surface
    -- everything expiring inside the next quarter, not just the next
    -- month. The 30/60/90 tier columns above keep the finer breakdown
    -- for the notification ladder.
    WHEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date <= CURRENT_DATE + INTERVAL '90 days' THEN 'expiring_soon'
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
  'expiring_soon now means within 90 days (widened from 30). '
  'Matches required_trainings.department against employees.division '
  '(falling back to employees.department for historical rows). '
  'Excusals matched by column_key so Initial Med ↔ Med Recert siblings '
  'satisfy each other. Board excluded from universal rules.';
