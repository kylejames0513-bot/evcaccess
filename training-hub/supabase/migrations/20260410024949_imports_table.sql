-- Run log for every import operation. Replaces the sync_log rows in
-- hub_settings. Each row is one import attempt: a CSV upload, a sign-in
-- form submission, an Access pivot, etc.
--
-- Lifecycle:
--   1. POST /api/imports/preview creates a row with status='preview' and
--      preview_payload populated with the parsed-but-not-yet-applied
--      result of running the resolver against the upload.
--   2. The HR admin reviews the preview in /imports.
--   3. POST /api/imports/commit calls the commit_import RPC which writes
--      the rows into employees / training_records / unresolved_people /
--      unknown_trainings inside one transaction and flips status to
--      'committed'.
--   4. If anything fails, status flips to 'failed' with error populated.
--
-- preview_payload format (JSONB):
--   {
--     "rows": [ ...parsed canonical tuples... ],
--     "added_employees": N,
--     "updated_employees": N,
--     "added_completions": N,
--     "skipped_dupes": N,
--     "unresolved_count": N,
--     "unknown_count": N
--   }

CREATE TABLE IF NOT EXISTS imports (
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
    CHECK (source IN ('paylocity', 'phs', 'access', 'signin', 'manual')),
  CONSTRAINT imports_status_check
    CHECK (status IN ('preview', 'committed', 'failed', 'rolled_back'))
);

CREATE INDEX IF NOT EXISTS idx_imports_started_at
  ON imports (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_imports_status_preview
  ON imports (status)
  WHERE status = 'preview';

CREATE INDEX IF NOT EXISTS idx_imports_source
  ON imports (source);

COMMENT ON TABLE imports IS
  'Run log for every import attempt. Replaces the sync_log hub_settings rows.';
