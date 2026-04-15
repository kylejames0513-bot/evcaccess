-- Fresh baseline migration 0002: imports + review queues + commit RPC.

CREATE TABLE imports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,
  filename        TEXT,
  uploaded_by     UUID REFERENCES auth.users(id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'preview',
  rows_in         INT,
  rows_added      INT,
  rows_updated    INT,
  rows_skipped    INT,
  rows_unresolved INT,
  rows_unknown    INT,
  error           TEXT,
  preview_payload JSONB,
  committed_at    TIMESTAMPTZ,
  CONSTRAINT imports_source_check
    CHECK (source IN ('paylocity', 'phs', 'access', 'signin', 'manual', 'cutover')),
  CONSTRAINT imports_status_check
    CHECK (status IN ('preview', 'committed', 'failed', 'rolled_back'))
);

CREATE INDEX idx_imports_started_at ON imports (started_at DESC);
CREATE INDEX idx_imports_status_preview ON imports (status) WHERE status = 'preview';
CREATE INDEX idx_imports_source ON imports (source);

COMMENT ON TABLE imports IS
  'Run log for every import attempt, including preview/commit lifecycle.';

CREATE TABLE unresolved_people (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id               UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  source                  TEXT NOT NULL,
  raw_payload             JSONB NOT NULL,
  last_name               TEXT,
  first_name              TEXT,
  full_name               TEXT,
  paylocity_id            TEXT,
  reason                  TEXT NOT NULL,
  suggested_employee_id   UUID REFERENCES employees(id),
  resolved_at             TIMESTAMPTZ,
  resolved_by             UUID REFERENCES auth.users(id),
  resolved_to_employee_id UUID REFERENCES employees(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unresolved_people_source_check
    CHECK (source IN ('paylocity', 'phs', 'access', 'signin', 'manual', 'cutover')),
  CONSTRAINT unresolved_people_reason_check
    CHECK (reason IN ('no_match', 'ambiguous', 'invalid_id', 'name_collision', 'special_status', 'name_map_no_match'))
);

CREATE INDEX idx_unresolved_people_import ON unresolved_people (import_id);
CREATE INDEX idx_unresolved_people_open ON unresolved_people (created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX idx_unresolved_people_paylocity_id ON unresolved_people (paylocity_id) WHERE paylocity_id IS NOT NULL;

COMMENT ON TABLE unresolved_people IS
  'Review queue for import rows whose person could not be matched.';

CREATE TABLE unknown_trainings (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id                    UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  source                       TEXT NOT NULL,
  raw_name                     TEXT NOT NULL,
  raw_payload                  JSONB NOT NULL,
  occurrence_count             INT NOT NULL DEFAULT 1,
  suggested_training_type_id   INT REFERENCES training_types(id),
  resolved_at                  TIMESTAMPTZ,
  resolved_by                  UUID REFERENCES auth.users(id),
  resolved_to_training_type_id INT REFERENCES training_types(id),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unknown_trainings_source_check
    CHECK (source IN ('paylocity', 'phs', 'access', 'signin', 'manual', 'cutover'))
);

CREATE UNIQUE INDEX unknown_trainings_unique
  ON unknown_trainings (import_id, source, lower(raw_name));
CREATE INDEX idx_unknown_trainings_open ON unknown_trainings (created_at DESC) WHERE resolved_at IS NULL;

COMMENT ON TABLE unknown_trainings IS
  'Review queue for import rows whose training name could not be matched.';

CREATE OR REPLACE FUNCTION add_employee_alias(emp_id uuid, new_alias text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE employees
     SET aliases = ARRAY(SELECT DISTINCT unnest(aliases || ARRAY[new_alias]))
   WHERE id = emp_id
     AND new_alias IS NOT NULL
     AND new_alias <> '';
$$;

CREATE OR REPLACE FUNCTION reactivate_employee_with_paylocity_id(
  orphan_id UUID,
  new_paylocity_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
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
    RAISE EXCEPTION 'reactivate_employee_with_paylocity_id: paylocity_id % already assigned to %', new_paylocity_id, conflict_id;
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
    RAISE EXCEPTION 'reactivate_employee_with_paylocity_id: no orphaned row found for id %', orphan_id;
  END IF;

  RETURN orphan_id;
END;
$$;

CREATE OR REPLACE FUNCTION commit_import(import_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
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
    RAISE EXCEPTION 'commit_import: import % is in status %, expected preview', import_id, current_status;
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

COMMENT ON FUNCTION reactivate_employee_with_paylocity_id(UUID, TEXT) IS
  'Reactivate an orphaned former employee profile and assign a new Paylocity ID.';

COMMENT ON FUNCTION commit_import(UUID) IS
  'Apply a previewed import payload in one transaction and mark it committed.';
