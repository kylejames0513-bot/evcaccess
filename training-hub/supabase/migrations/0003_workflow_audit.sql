-- Fresh baseline migration 0003: workflow audit tables / queues.

CREATE TABLE new_hire_tracker_rows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet       TEXT NOT NULL,
  row_number  INTEGER NOT NULL,
  section     TEXT NOT NULL DEFAULT 'new_hire',
  last_name   TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  hire_date   DATE NOT NULL,
  paylocity_id TEXT,
  division    TEXT,
  department  TEXT,
  position    TEXT,
  job_title   TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  notes       TEXT,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT new_hire_tracker_rows_sheet_row_section UNIQUE (sheet, row_number, section)
);

CREATE INDEX new_hire_tracker_rows_sheet_idx ON new_hire_tracker_rows (sheet);

CREATE TABLE separation_tracker_rows (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fy_sheet           TEXT NOT NULL,
  row_number         INTEGER NOT NULL,
  last_name          TEXT NOT NULL,
  first_name         TEXT NOT NULL,
  date_of_separation DATE NOT NULL,
  employee_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  sync_status        TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT separation_tracker_rows_sheet_row UNIQUE (fy_sheet, row_number)
);

CREATE INDEX separation_tracker_rows_fy_sheet_idx ON separation_tracker_rows (fy_sheet);

CREATE TABLE pending_roster_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN ('new_hires_batch', 'separations_batch')),
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'approved', 'denied', 'failed')),
  source          TEXT NOT NULL DEFAULT 'excel_vba',
  error_message   TEXT,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_pending_roster_events_status
  ON pending_roster_events (status)
  WHERE status = 'pending';
CREATE INDEX idx_pending_roster_events_created
  ON pending_roster_events (created_at DESC);

COMMENT ON TABLE pending_roster_events IS
  'Roster queue for gated Excel batch approval (/roster-queue).';
