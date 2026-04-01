-- ============================================================
-- EVC Training Hub — Database Schema
-- ============================================================
-- Migrated from Google Sheets / Apps Script system
-- HR Program Coordinator: Kyle Mahoney, Emory Valley Center
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('employee', 'supervisor', 'hr_admin');
CREATE TYPE compliance_status AS ENUM ('current', 'expiring_soon', 'expired', 'needed', 'excused');
CREATE TYPE session_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE attendance_status AS ENUM ('enrolled', 'attended', 'passed', 'failed', 'no_show', 'cancelled');
CREATE TYPE schedule_weekday AS ENUM ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');

-- ────────────────────────────────────────────────────────────
-- EMPLOYEES
-- ────────────────────────────────────────────────────────────

CREATE TABLE employees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id       UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT UNIQUE,
  role          user_role NOT NULL DEFAULT 'employee',
  job_title     TEXT,
  department    TEXT,
  program       TEXT,           -- e.g., ELC, EI, Residential
  hire_date     DATE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  excusal_codes TEXT[] DEFAULT '{}',  -- e.g., {'NURSE','ELC'} — exempt from certain trainings
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employees_active ON employees (is_active) WHERE is_active = true;
CREATE INDEX idx_employees_name ON employees (last_name, first_name);

-- ────────────────────────────────────────────────────────────
-- NICKNAMES (for name matching during QR scan / import)
-- ────────────────────────────────────────────────────────────

CREATE TABLE nicknames (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  alias         TEXT NOT NULL,
  is_evc        BOOLEAN NOT NULL DEFAULT false,  -- true = EVC-specific mapping
  UNIQUE(name, alias)
);

CREATE INDEX idx_nicknames_name ON nicknames (lower(name));
CREATE INDEX idx_nicknames_alias ON nicknames (lower(alias));

-- ────────────────────────────────────────────────────────────
-- TRAINING TYPES (migrated from TRAINING_CONFIG)
-- ────────────────────────────────────────────────────────────

CREATE TABLE training_types (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,       -- e.g., "CPR/FA"
  column_key      TEXT NOT NULL,              -- e.g., "CPR" — maps to old sheet column
  renewal_years   INT NOT NULL DEFAULT 0,     -- 0 = one and done
  is_required     BOOLEAN NOT NULL DEFAULT false,
  class_capacity  INT NOT NULL DEFAULT 15,
  prerequisite_id INT REFERENCES training_types(id),
  only_expired    BOOLEAN NOT NULL DEFAULT false,
  only_needed     BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- TRAINING TYPE ALIASES (e.g., "cpr" -> CPR/FA)
-- ────────────────────────────────────────────────────────────

CREATE TABLE training_aliases (
  id               SERIAL PRIMARY KEY,
  training_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  alias            TEXT NOT NULL,
  UNIQUE(alias)
);

CREATE INDEX idx_training_aliases_type ON training_aliases (training_type_id);

-- ────────────────────────────────────────────────────────────
-- RECURRING SCHEDULES (e.g., CPR on Thursdays)
-- ────────────────────────────────────────────────────────────

CREATE TABLE training_schedules (
  id               SERIAL PRIMARY KEY,
  training_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  weekday          schedule_weekday NOT NULL,
  nth_weeks        INT[],          -- e.g., {2,4} = 2nd and 4th week of month; null = every week
  weeks_out        INT NOT NULL DEFAULT 4,  -- how far ahead to auto-generate
  start_time       TIME,
  duration_minutes INT DEFAULT 60,
  location         TEXT
);

-- ────────────────────────────────────────────────────────────
-- AUTO-FILL RULES (e.g., CPR <-> FirstAid same day)
-- ────────────────────────────────────────────────────────────

CREATE TABLE auto_fill_rules (
  id                SERIAL PRIMARY KEY,
  source_type_id    INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  target_type_id    INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  offset_days       INT NOT NULL DEFAULT 0  -- 0 = same day, 1 = next day, etc.
);

-- ────────────────────────────────────────────────────────────
-- TRAINING RULES (role-based requirements)
-- Maps job titles / departments / programs to required trainings
-- ────────────────────────────────────────────────────────────

CREATE TABLE training_rules (
  id               SERIAL PRIMARY KEY,
  training_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  -- Match criteria (any non-null field must match the employee)
  job_title        TEXT,
  department       TEXT,
  program          TEXT,
  excusal_code     TEXT,          -- if employee has this code, mark excused
  is_required      BOOLEAN NOT NULL DEFAULT true,  -- true = must take, false = excused
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_rules_type ON training_rules (training_type_id);

-- ────────────────────────────────────────────────────────────
-- TRAINING SESSIONS (scheduled classes)
-- ────────────────────────────────────────────────────────────

CREATE TABLE training_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_type_id INT NOT NULL REFERENCES training_types(id),
  session_date     DATE NOT NULL,
  start_time       TIME,
  end_time         TIME,
  location         TEXT,
  instructor       TEXT,
  capacity         INT NOT NULL DEFAULT 15,
  status           session_status NOT NULL DEFAULT 'scheduled',
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_date ON training_sessions (session_date);
CREATE INDEX idx_sessions_type ON training_sessions (training_type_id);
CREATE INDEX idx_sessions_status ON training_sessions (status) WHERE status = 'scheduled';

-- ────────────────────────────────────────────────────────────
-- ENROLLMENTS (who is signed up for what session)
-- ────────────────────────────────────────────────────────────

CREATE TABLE enrollments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  status           attendance_status NOT NULL DEFAULT 'enrolled',
  enrolled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_at    TIMESTAMPTZ,   -- QR scan timestamp
  completed_at     TIMESTAMPTZ,
  score            TEXT,           -- pass/fail or numeric
  notes            TEXT,
  UNIQUE(session_id, employee_id)
);

CREATE INDEX idx_enrollments_employee ON enrollments (employee_id);
CREATE INDEX idx_enrollments_session ON enrollments (session_id);

-- ────────────────────────────────────────────────────────────
-- TRAINING RECORDS (completed trainings — the source of truth)
-- One row per employee per training type per completion
-- ────────────────────────────────────────────────────────────

CREATE TABLE training_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  training_type_id INT NOT NULL REFERENCES training_types(id),
  completion_date  DATE NOT NULL,
  expiration_date  DATE,          -- auto-calculated from renewal_years
  session_id       UUID REFERENCES training_sessions(id),  -- null if imported/backfilled
  source           TEXT NOT NULL DEFAULT 'manual',  -- 'qr_scan', 'manual', 'import', 'paylocity'
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_records_employee ON training_records (employee_id);
CREATE INDEX idx_records_type ON training_records (training_type_id);
CREATE INDEX idx_records_expiration ON training_records (expiration_date) WHERE expiration_date IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- EXCUSAL RECORDS (employee X is excused from training Y)
-- Replaces the old excusal code check per training column
-- ────────────────────────────────────────────────────────────

CREATE TABLE excusals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  training_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,  -- e.g., 'NURSE', 'ELC', 'NA'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, training_type_id)
);

-- ────────────────────────────────────────────────────────────
-- NOTIFICATIONS LOG
-- ────────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID REFERENCES employees(id) ON DELETE CASCADE,
  type             TEXT NOT NULL,  -- 'expiration_warning', 'enrollment_confirm', 'class_reminder'
  subject          TEXT NOT NULL,
  body             TEXT,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel          TEXT NOT NULL DEFAULT 'email'  -- 'email', 'in_app'
);

CREATE INDEX idx_notifications_employee ON notifications (employee_id);

-- ────────────────────────────────────────────────────────────
-- REMOVAL LOG (audit trail — mirrors old Removal Log sheet)
-- ────────────────────────────────────────────────────────────

CREATE TABLE removal_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES employees(id),
  session_id       UUID NOT NULL REFERENCES training_sessions(id),
  removed_by       UUID REFERENCES employees(id),
  reason           TEXT,
  removed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- VIEWS — Compliance Dashboard
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW employee_compliance AS
SELECT
  e.id AS employee_id,
  e.first_name,
  e.last_name,
  e.job_title,
  e.department,
  e.program,
  tt.id AS training_type_id,
  tt.name AS training_name,
  tt.renewal_years,
  tt.is_required,
  -- Latest completion
  latest.completion_date,
  latest.expiration_date,
  -- Excusal
  exc.reason AS excusal_reason,
  -- Compliance status
  CASE
    WHEN exc.id IS NOT NULL THEN 'excused'
    WHEN latest.completion_date IS NULL THEN 'needed'
    WHEN tt.renewal_years = 0 THEN 'current'  -- one-and-done, completed
    WHEN latest.expiration_date < CURRENT_DATE THEN 'expired'
    WHEN latest.expiration_date < CURRENT_DATE + INTERVAL '60 days' THEN 'expiring_soon'
    ELSE 'current'
  END::compliance_status AS status
FROM employees e
CROSS JOIN training_types tt
LEFT JOIN LATERAL (
  SELECT tr.completion_date, tr.expiration_date
  FROM training_records tr
  WHERE tr.employee_id = e.id AND tr.training_type_id = tt.id
  ORDER BY tr.completion_date DESC
  LIMIT 1
) latest ON true
LEFT JOIN excusals exc ON exc.employee_id = e.id AND exc.training_type_id = tt.id
WHERE e.is_active = true AND tt.is_active = true;

-- ────────────────────────────────────────────────────────────
-- FUNCTIONS — Auto-calculate expiration on insert
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION calculate_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expiration_date IS NULL THEN
    SELECT
      CASE WHEN tt.renewal_years > 0
        THEN NEW.completion_date + (tt.renewal_years * INTERVAL '1 year')
        ELSE NULL
      END INTO NEW.expiration_date
    FROM training_types tt
    WHERE tt.id = NEW.training_type_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_expiration
  BEFORE INSERT OR UPDATE ON training_records
  FOR EACH ROW
  EXECUTE FUNCTION calculate_expiration();

-- ────────────────────────────────────────────────────────────
-- FUNCTIONS — Auto-fill linked trainings
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION apply_auto_fill()
RETURNS TRIGGER AS $$
DECLARE
  rule RECORD;
BEGIN
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
    ON CONFLICT DO NOTHING;  -- don't duplicate if already exists
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_fill
  AFTER INSERT ON training_records
  FOR EACH ROW
  EXECUTE FUNCTION apply_auto_fill();

-- ────────────────────────────────────────────────────────────
-- FUNCTIONS — Updated_at trigger
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON training_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
