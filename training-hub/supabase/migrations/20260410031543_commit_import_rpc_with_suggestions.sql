CREATE OR REPLACE FUNCTION commit_import(import_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  payload         JSONB;
  current_status  TEXT;
  src             TEXT;
  added_count     INT := 0;
  unresolved_count INT := 0;
  unknown_count   INT := 0;
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
    RAISE EXCEPTION 'commit_import: import % is in status %, expected preview', import_id, current_status;
  END IF;

  IF payload IS NULL THEN
    RAISE EXCEPTION 'commit_import: import % has no preview_payload', import_id;
  END IF;

  WITH inserted AS (
    INSERT INTO training_records (employee_id, training_type_id, completion_date, expiration_date, source, notes, pass_fail, reviewed_by)
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
      import_id, source, raw_payload, last_name, first_name, full_name,
      paylocity_id, reason, suggested_employee_id
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
      import_id, source, raw_name, raw_payload, occurrence_count
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
