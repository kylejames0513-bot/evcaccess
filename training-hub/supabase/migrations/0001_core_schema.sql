-- Fresh baseline migration 0001: core schema
-- Consolidates the final table/enum/index shape used by the app.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('employee', 'supervisor', 'hr_admin');
CREATE TYPE compliance_status AS ENUM ('current', 'expiring_soon', 'expired', 'needed', 'excused');
CREATE TYPE session_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE attendance_status AS ENUM ('enrolled', 'attended', 'passed', 'failed', 'no_show', 'cancelled');
CREATE TYPE schedule_weekday AS ENUM ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');

CREATE TABLE employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id         UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT UNIQUE,
  role            user_role NOT NULL DEFAULT 'employee',
  job_title       TEXT,
  department      TEXT,
  division        TEXT,
  position        TEXT,
  program         TEXT,
  hire_date       DATE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  terminated_at   TIMESTAMPTZ,
  reactivated_at  TIMESTAMPTZ,
  employee_number TEXT,
  paylocity_id    TEXT,
  excusal_codes   TEXT[] DEFAULT '{}',
  aliases         TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX employees_name_unique_ci
  ON employees (lower(last_name), lower(first_name));
CREATE UNIQUE INDEX employees_employee_number_unique
  ON employees (employee_number)
  WHERE employee_number IS NOT NULL;
CREATE UNIQUE INDEX employees_paylocity_id_unique
  ON employees (paylocity_id)
  WHERE paylocity_id IS NOT NULL;
CREATE INDEX idx_employees_active
  ON employees (is_active)
  WHERE is_active = true;
CREATE INDEX idx_employees_position
  ON employees (lower(position))
  WHERE position IS NOT NULL;
CREATE INDEX idx_employees_division
  ON employees (lower(division))
  WHERE division IS NOT NULL;
CREATE INDEX idx_employees_aliases
  ON employees USING GIN (aliases);

COMMENT ON COLUMN employees.terminated_at IS
  'Set when is_active flips to false. Cleared on reactivation.';
COMMENT ON COLUMN employees.reactivated_at IS
  'Set when a former employee row is rehired with a new Paylocity ID.';
COMMENT ON COLUMN employees.position IS
  'Strict position used for required_trainings matching.';
COMMENT ON COLUMN employees.division IS
  'Umbrella division name (Residential, Behavioral Health, etc.).';
COMMENT ON COLUMN employees.paylocity_id IS
  'Canonical Paylocity employee ID.';

CREATE TABLE nicknames (
  id       SERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  alias    TEXT NOT NULL,
  is_evc   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (name, alias)
);

CREATE INDEX idx_nicknames_name ON nicknames (lower(name));
CREATE INDEX idx_nicknames_alias ON nicknames (lower(alias));

CREATE TABLE training_types (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  column_key      TEXT NOT NULL,
  renewal_years   INT NOT NULL DEFAULT 0,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  class_capacity  INT NOT NULL DEFAULT 15,
  prerequisite_id INT REFERENCES training_types(id),
  only_expired    BOOLEAN NOT NULL DEFAULT false,
  only_needed     BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE training_aliases (
  id               SERIAL PRIMARY KEY,
  training_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  alias            TEXT NOT NULL UNIQUE,
  source           TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX idx_training_aliases_type
  ON training_aliases (training_type_id);
CREATE INDEX idx_training_aliases_source
  ON training_aliases (source);

COMMENT ON COLUMN training_aliases.source IS
  'Where this alias was learned (manual/paylocity/phs/access/signin).';

CREATE TABLE auto_fill_rules (
  id             SERIAL PRIMARY KEY,
  source_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  target_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  offset_days    INT NOT NULL DEFAULT 0
);

CREATE TABLE required_trainings (
  id               SERIAL PRIMARY KEY,
  training_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  department       TEXT,
  position         TEXT,
  is_required      BOOLEAN NOT NULL DEFAULT true,
  is_universal     BOOLEAN NOT NULL DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT required_trainings_universal_xor_dept
    CHECK (
      (is_universal = true AND department IS NULL AND position IS NULL)
      OR
      (is_universal = false AND department IS NOT NULL)
    )
);

CREATE UNIQUE INDEX required_trainings_unique
  ON required_trainings (
    training_type_id,
    COALESCE(lower(department), ''),
    COALESCE(lower(position), '')
  );
CREATE INDEX idx_required_trainings_dept
  ON required_trainings (lower(department))
  WHERE department IS NOT NULL;
CREATE INDEX idx_required_trainings_universal
  ON required_trainings (is_universal)
  WHERE is_universal = true;

COMMENT ON TABLE required_trainings IS
  'Per-training requirement rules for universal/department/position scopes.';

CREATE TABLE training_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_type_id   INT NOT NULL REFERENCES training_types(id),
  session_date       DATE NOT NULL,
  start_time         TIME,
  end_time           TIME,
  location           TEXT,
  instructor         TEXT,
  capacity           INT NOT NULL DEFAULT 15,
  status             session_status NOT NULL DEFAULT 'scheduled',
  notes              TEXT,
  roster_manual_lock BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_date ON training_sessions (session_date);
CREATE INDEX idx_sessions_type ON training_sessions (training_type_id);
CREATE INDEX idx_sessions_status
  ON training_sessions (status)
  WHERE status = 'scheduled';

COMMENT ON COLUMN training_sessions.roster_manual_lock IS
  'When true, auto-prune and auto-fill skip this session.';

CREATE TABLE enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status        attendance_status NOT NULL DEFAULT 'enrolled',
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_at TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  score         TEXT,
  notes         TEXT,
  UNIQUE (session_id, employee_id)
);

CREATE INDEX idx_enrollments_employee ON enrollments (employee_id);
CREATE INDEX idx_enrollments_session ON enrollments (session_id);

CREATE TABLE training_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  training_type_id INT NOT NULL REFERENCES training_types(id),
  completion_date  DATE NOT NULL,
  expiration_date  DATE,
  session_id       UUID REFERENCES training_sessions(id),
  source           TEXT NOT NULL DEFAULT 'manual',
  notes            TEXT,
  pass_fail        TEXT,
  reviewed_by      TEXT,
  arrival_time     TEXT,
  end_time         TEXT,
  session_length   TEXT,
  left_early       TEXT,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX training_records_emp_type_date_unique
  ON training_records (employee_id, training_type_id, completion_date);
CREATE INDEX idx_records_employee ON training_records (employee_id);
CREATE INDEX idx_records_type ON training_records (training_type_id);
CREATE INDEX idx_records_expiration
  ON training_records (expiration_date)
  WHERE expiration_date IS NOT NULL;
CREATE INDEX idx_records_pending_review
  ON training_records ((pass_fail IS NULL OR lower(pass_fail) = 'pending'))
  WHERE pass_fail IS NULL OR lower(pass_fail) = 'pending';

CREATE TABLE excusals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  training_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'manual',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, training_type_id)
);

CREATE TABLE hub_settings (
  id         SERIAL PRIMARY KEY,
  type       TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, key)
);

CREATE INDEX idx_hub_settings_type ON hub_settings (type);
