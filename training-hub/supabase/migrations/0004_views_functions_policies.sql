-- Fresh baseline migration 0004: views, functions, triggers, and RLS policies

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION calculate_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.expiration_date IS NULL THEN
    SELECT
      CASE
        WHEN tt.renewal_years > 0
          THEN NEW.completion_date + (tt.renewal_years * INTERVAL '1 year')
        ELSE NULL
      END
      INTO NEW.expiration_date
    FROM training_types tt
    WHERE tt.id = NEW.training_type_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION apply_auto_fill()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  rule RECORD;
BEGIN
  IF NEW.source = 'auto_fill' THEN
    RETURN NEW;
  END IF;

  FOR rule IN
    SELECT afr.target_type_id, afr.offset_days
    FROM auto_fill_rules afr
    WHERE afr.source_type_id = NEW.training_type_id
  LOOP
    INSERT INTO training_records (employee_id, training_type_id, completion_date, session_id, source)
    VALUES (
      NEW.employee_id,
      rule.target_type_id,
      NEW.completion_date + rule.offset_days,
      NEW.session_id,
      'auto_fill'
    )
    ON CONFLICT (employee_id, training_type_id, completion_date) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION add_employee_alias(emp_id uuid, new_alias text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  UPDATE employees
     SET aliases = ARRAY(SELECT DISTINCT unnest(aliases || ARRAY[new_alias]))
   WHERE id = emp_id
     AND new_alias IS NOT NULL
     AND new_alias <> '';
$$;

CREATE OR REPLACE FUNCTION upsert_employees_from_sheet(emps jsonb)
RETURNS TABLE (id uuid, last_name text, first_name text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Pass 1: update by employee_number
  RETURN QUERY
  UPDATE employees e
     SET last_name  = (em->>'last_name')::text,
         first_name = (em->>'first_name')::text,
         is_active  = COALESCE((em->>'is_active')::boolean, true),
         department = NULLIF(em->>'department', '')::text,
         division   = NULLIF(em->>'division', '')::text,
         position   = NULLIF(em->>'position', '')::text,
         hire_date  = NULLIF(em->>'hire_date', '')::date,
         paylocity_id = COALESCE(NULLIF(em->>'paylocity_id', ''), e.paylocity_id),
         aliases    = ARRAY(
           SELECT DISTINCT unnest(
             e.aliases ||
             COALESCE(
               ARRAY(SELECT jsonb_array_elements_text(COALESCE(em->'aliases', '[]'::jsonb))),
               '{}'::text[]
             )
           )
         ),
         updated_at = now()
    FROM jsonb_array_elements(emps) AS em
   WHERE e.employee_number IS NOT NULL
     AND e.employee_number = NULLIF(em->>'employee_number', '')
  RETURNING e.id, e.last_name, e.first_name;

  -- Pass 2: insert/upsert-by-name for rows not matched by employee_number
  RETURN QUERY
  INSERT INTO employees (
    last_name,
    first_name,
    is_active,
    department,
    division,
    position,
    hire_date,
    employee_number,
    paylocity_id,
    aliases
  )
  SELECT
    (em->>'last_name')::text,
    (em->>'first_name')::text,
    COALESCE((em->>'is_active')::boolean, true),
    NULLIF(em->>'department', '')::text,
    NULLIF(em->>'division', '')::text,
    NULLIF(em->>'position', '')::text,
    NULLIF(em->>'hire_date', '')::date,
    NULLIF(em->>'employee_number', '')::text,
    NULLIF(em->>'paylocity_id', '')::text,
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(em->'aliases', '[]'::jsonb))),
      '{}'::text[]
    )
  FROM jsonb_array_elements(emps) AS em
  WHERE NULLIF(em->>'employee_number', '') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM employees e2
        WHERE e2.employee_number IS NOT NULL
          AND e2.employee_number = NULLIF(em->>'employee_number', '')
     )
  ON CONFLICT ((lower(employees.last_name)), (lower(employees.first_name))) DO UPDATE SET
    is_active       = EXCLUDED.is_active,
    department      = EXCLUDED.department,
    division        = COALESCE(EXCLUDED.division, employees.division),
    position        = COALESCE(EXCLUDED.position, employees.position),
    hire_date       = EXCLUDED.hire_date,
    employee_number = COALESCE(EXCLUDED.employee_number, employees.employee_number),
    paylocity_id    = COALESCE(EXCLUDED.paylocity_id, employees.paylocity_id),
    aliases         = ARRAY(
      SELECT DISTINCT unnest(employees.aliases || EXCLUDED.aliases)
    ),
    updated_at      = now()
  RETURNING employees.id, employees.last_name, employees.first_name;
END;
$$;

CREATE OR REPLACE FUNCTION reactivate_employee_with_paylocity_id(
  orphan_id UUID,
  new_paylocity_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  conflict_id UUID;
BEGIN
  IF new_paylocity_id IS NULL OR length(trim(new_paylocity_id)) = 0 THEN
    RAISE EXCEPTION 'reactivate_employee_with_paylocity_id: new_paylocity_id is required';
  END IF;

  SELECT id INTO conflict_id
    FROM employees
   WHERE paylocity_id = new_paylocity_id
     AND id <> orphan_id
   LIMIT 1;

  IF conflict_id IS NOT NULL THEN
    RAISE EXCEPTION
      'reactivate_employee_with_paylocity_id: paylocity_id % already assigned to %',
      new_paylocity_id,
      conflict_id;
  END IF;

  UPDATE employees
     SET is_active       = true,
         paylocity_id    = new_paylocity_id,
         employee_number = COALESCE(employee_number, new_paylocity_id),
         reactivated_at  = now(),
         terminated_at   = NULL,
         updated_at      = now()
   WHERE id = orphan_id
     AND is_active = false
     AND paylocity_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'reactivate_employee_with_paylocity_id: no orphaned row found for id %',
      orphan_id;
  END IF;

  RETURN orphan_id;
END;
$$;

CREATE OR REPLACE FUNCTION commit_import(import_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  payload          JSONB;
  current_status   TEXT;
  src              TEXT;
  added_count      INT := 0;
  unresolved_count INT := 0;
  unknown_count    INT := 0;
BEGIN
  SELECT preview_payload, status, source
    INTO payload, current_status, src
    FROM imports
   WHERE id = import_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commit_import: import % not found', import_id;
  END IF;

  IF current_status <> 'preview' THEN
    RAISE EXCEPTION
      'commit_import: import % is in status %, expected preview',
      import_id,
      current_status;
  END IF;

  IF payload IS NULL THEN
    RAISE EXCEPTION 'commit_import: import % has no preview_payload', import_id;
  END IF;

  WITH inserted AS (
    INSERT INTO training_records (
      employee_id,
      training_type_id,
      completion_date,
      expiration_date,
      source,
      notes,
      pass_fail,
      reviewed_by
    )
    SELECT
      (c->>'employee_id')::uuid,
      (c->>'training_type_id')::int,
      (c->>'completion_date')::date,
      NULLIF(c->>'expiration_date', '')::date,
      COALESCE(c->>'source', src),
      NULLIF(c->>'notes', ''),
      NULLIF(c->>'pass_fail', ''),
      NULLIF(c->>'reviewed_by', '')
    FROM jsonb_array_elements(COALESCE(payload->'completions', '[]'::jsonb)) AS c
    ON CONFLICT (employee_id, training_type_id, completion_date) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO added_count FROM inserted;

  INSERT INTO excusals (employee_id, training_type_id, reason, source)
  SELECT
    (e->>'employee_id')::uuid,
    (e->>'training_type_id')::int,
    e->>'reason',
    COALESCE(e->>'source', src)
  FROM jsonb_array_elements(COALESCE(payload->'excusals', '[]'::jsonb)) AS e
  ON CONFLICT (employee_id, training_type_id) DO UPDATE SET
    reason = EXCLUDED.reason,
    source = EXCLUDED.source;

  WITH inserted_people AS (
    INSERT INTO unresolved_people (
      import_id,
      source,
      raw_payload,
      last_name,
      first_name,
      full_name,
      paylocity_id,
      reason,
      suggested_employee_id
    )
    SELECT
      import_id,
      COALESCE(p->>'source', src),
      p->'raw_payload',
      NULLIF(p->>'last_name', ''),
      NULLIF(p->>'first_name', ''),
      NULLIF(p->>'full_name', ''),
      NULLIF(p->>'paylocity_id', ''),
      p->>'reason',
      NULLIF(p->>'suggested_employee_id', '')::uuid
    FROM jsonb_array_elements(COALESCE(payload->'unresolved_people', '[]'::jsonb)) AS p
    RETURNING 1
  )
  SELECT count(*) INTO unresolved_count FROM inserted_people;

  WITH inserted_trainings AS (
    INSERT INTO unknown_trainings (
      import_id,
      source,
      raw_name,
      raw_payload,
      occurrence_count
    )
    SELECT
      import_id,
      COALESCE(u->>'source', src),
      u->>'raw_name',
      u->'raw_payload',
      COALESCE((u->>'occurrence_count')::int, 1)
    FROM jsonb_array_elements(COALESCE(payload->'unknown_trainings', '[]'::jsonb)) AS u
    ON CONFLICT (import_id, source, lower(raw_name)) DO UPDATE SET
      occurrence_count = unknown_trainings.occurrence_count + EXCLUDED.occurrence_count
    RETURNING 1
  )
  SELECT count(*) INTO unknown_count FROM inserted_trainings;

  UPDATE imports
     SET status          = 'committed',
         finished_at     = now(),
         committed_at    = now(),
         rows_added      = added_count,
         rows_unresolved = unresolved_count,
         rows_unknown    = unknown_count
   WHERE id = import_id;

  RETURN import_id;
END;
$$;

CREATE OR REPLACE VIEW master_completions
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (tr.employee_id, tr.training_type_id)
  tr.employee_id,
  tr.training_type_id,
  tr.completion_date,
  tr.expiration_date,
  tr.source,
  tr.id AS training_record_id,
  tr.created_at AS recorded_at
FROM training_records tr
ORDER BY
  tr.employee_id,
  tr.training_type_id,
  tr.completion_date DESC,
  CASE tr.source
    WHEN 'paylocity'              THEN 1
    WHEN 'phs'                    THEN 2
    WHEN 'access'                 THEN 3
    WHEN 'signin'                 THEN 4
    WHEN 'training_records_sheet' THEN 4
    WHEN 'manual'                 THEN 5
    WHEN 'merged_sheet'           THEN 6
    WHEN 'auto_fill'              THEN 7
    ELSE 99
  END ASC,
  tr.created_at DESC;

CREATE OR REPLACE VIEW employee_history
WITH (security_invoker = true)
AS
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
JOIN employees e ON e.id = tr.employee_id
JOIN training_types tt ON tt.id = tr.training_type_id;

CREATE OR REPLACE VIEW employee_compliance
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
        SELECT t2.column_key
        FROM training_types t2
        WHERE t2.id <> tt.id AND t2.column_key = tt.column_key
      )
    THEN (
      SELECT t3.name
      FROM training_types t3
      WHERE t3.column_key = tt.column_key AND t3.renewal_years = 0
      LIMIT 1
    )
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
      CASE
        WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
          THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
        ELSE latest.expiration_date
      END,
      '9999-12-31'::date
    ) <= CURRENT_DATE + INTERVAL '30 days'
      AND COALESCE(
        CASE
          WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
            THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
          ELSE latest.expiration_date
        END,
        '9999-12-31'::date
      ) >= CURRENT_DATE
    THEN true ELSE false
  END            AS due_in_30,
  CASE
    WHEN COALESCE(
      CASE
        WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
          THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
        ELSE latest.expiration_date
      END,
      '9999-12-31'::date
    ) <= CURRENT_DATE + INTERVAL '60 days'
      AND COALESCE(
        CASE
          WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
            THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
          ELSE latest.expiration_date
        END,
        '9999-12-31'::date
      ) > CURRENT_DATE + INTERVAL '30 days'
    THEN true ELSE false
  END            AS due_in_60,
  CASE
    WHEN COALESCE(
      CASE
        WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
          THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
        ELSE latest.expiration_date
      END,
      '9999-12-31'::date
    ) <= CURRENT_DATE + INTERVAL '90 days'
      AND COALESCE(
        CASE
          WHEN latest.completion_date IS NOT NULL AND tt.renewal_years > 0
            THEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date
          ELSE latest.expiration_date
        END,
        '9999-12-31'::date
      ) > CURRENT_DATE + INTERVAL '60 days'
    THEN true ELSE false
  END            AS due_in_90,
  CASE
    WHEN exc.id IS NOT NULL THEN 'excused'
    WHEN latest.completion_date IS NULL THEN 'needed'
    WHEN tt.renewal_years = 0 THEN 'current'
    WHEN (latest.completion_date + (tt.renewal_years * INTERVAL '1 year'))::date < CURRENT_DATE THEN 'expired'
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
JOIN training_types tt
  ON tt.id = rt.training_type_id
 AND tt.is_active = true
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

CREATE TRIGGER trg_calculate_expiration
  BEFORE INSERT OR UPDATE ON training_records
  FOR EACH ROW
  EXECUTE FUNCTION calculate_expiration();

CREATE TRIGGER trg_auto_fill
  AFTER INSERT ON training_records
  FOR EACH ROW
  EXECUTE FUNCTION apply_auto_fill();

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON training_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_hub_settings_updated_at
  BEFORE UPDATE ON hub_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_required_trainings_updated_at
  BEFORE UPDATE ON required_trainings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE excusals ENABLE ROW LEVEL SECURITY;
ALTER TABLE required_trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE unknown_trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE unresolved_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_fill_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE nicknames ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE new_hire_tracker_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE separation_tracker_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_roster_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read employees"
  ON employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read training_records"
  ON training_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read training_types"
  ON training_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read training_aliases"
  ON training_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read excusals"
  ON excusals FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read required_trainings"
  ON required_trainings FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read unknown_trainings"
  ON unknown_trainings FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read unresolved_people"
  ON unresolved_people FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read imports"
  ON imports FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read hub_settings"
  ON hub_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read auto_fill_rules"
  ON auto_fill_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read nicknames"
  ON nicknames FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read training_sessions"
  ON training_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read enrollments"
  ON enrollments FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read new_hire_tracker_rows"
  ON new_hire_tracker_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read separation_tracker_rows"
  ON separation_tracker_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read pending_roster_events"
  ON pending_roster_events FOR SELECT TO authenticated USING (true);

COMMENT ON VIEW employee_compliance IS
  'Compliance status per (active employee, required training). '
  'expiring_soon = within 90 days; required rules matched on division/position; '
  'completions and excusals matched by shared column_key.';
COMMENT ON VIEW employee_history IS
  'Full per-employee training audit trail across every source.';
COMMENT ON VIEW master_completions IS
  'Winning training_records row per (employee, training) by latest date and source priority.';
