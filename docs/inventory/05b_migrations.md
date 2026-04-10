# 05b Migrations (part 2 of 4)

## 001_initial_schema.sql (lines 201–356, continued from 05a)

```sql
CREATE TABLE excusals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  training_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  reason           TEXT NOT NULL,  -- e.g., 'NURSE', 'ELC', 'NA'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, training_type_id)
);

-- NOTIFICATIONS LOG
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

-- REMOVAL LOG (audit trail, mirrors old Removal Log sheet)
CREATE TABLE removal_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES employees(id),
  session_id       UUID NOT NULL REFERENCES training_sessions(id),
  removed_by       UUID REFERENCES employees(id),
  reason           TEXT,
  removed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VIEWS: Compliance Dashboard
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
  latest.completion_date,
  latest.expiration_date,
  exc.reason AS excusal_reason,
  CASE
    WHEN exc.id IS NOT NULL THEN 'excused'
    WHEN latest.completion_date IS NULL THEN 'needed'
    WHEN tt.renewal_years = 0 THEN 'current'
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

-- FUNCTIONS: Auto-calculate expiration on insert
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

-- FUNCTIONS: Auto-fill linked trainings
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
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_fill
  AFTER INSERT ON training_records
  FOR EACH ROW
  EXECUTE FUNCTION apply_auto_fill();

-- FUNCTIONS: Updated_at trigger
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
```

## 002_hub_settings.sql

```sql
CREATE TABLE hub_settings (
  id         SERIAL PRIMARY KEY,
  type       TEXT NOT NULL,   -- 'exclude', 'capacity', 'expiration_threshold', 'compliance', 'dept_rule', 'no_show', 'sync_log'
  key        TEXT NOT NULL,
  value      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(type, key)
);

CREATE INDEX idx_hub_settings_type ON hub_settings (type);

CREATE TRIGGER trg_hub_settings_updated_at
  BEFORE UPDATE ON hub_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Archived sessions table (replaces "Archive" Google Sheet tab)
CREATE TABLE archived_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training     TEXT NOT NULL,
  session_date TEXT NOT NULL,
  time         TEXT,
  location     TEXT,
  enrolled     TEXT[] DEFAULT '{}',
  no_shows     TEXT[] DEFAULT '{}',
  archived_on  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_archived_sessions_date ON archived_sessions (archived_on DESC);
```

## 003_seed_data.sql

```sql
-- First Aid (column_key = FIRSTAID), required for CPR/FA mirror logic in auto_fill_rules.
INSERT INTO training_types (
  name, column_key, renewal_years, is_required, class_capacity,
  only_expired, only_needed, is_active
)
VALUES (
  'First Aid', 'FIRSTAID', 2, true, 10,
  false, false, true
)
ON CONFLICT (column_key) DO NOTHING;

-- Mirror rule: CPR completion -> also record First Aid same day
DO $$
DECLARE
  cpr_id INT;
  fa_id  INT;
BEGIN
  SELECT id INTO cpr_id FROM training_types WHERE column_key = 'CPR';
  SELECT id INTO fa_id  FROM training_types WHERE column_key = 'FIRSTAID';

  IF cpr_id IS NOT NULL AND fa_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM auto_fill_rules
      WHERE source_type_id = cpr_id
        AND target_type_id = fa_id
        AND offset_days = 0
    ) THEN
      INSERT INTO auto_fill_rules (source_type_id, target_type_id, offset_days)
      VALUES (cpr_id, fa_id, 0);
    END IF;
  END IF;
END $$;
```

Heads up: migration 003 references a `column_key` unique constraint via `ON CONFLICT (column_key) DO NOTHING`, but 001 declares `column_key` as NOT NULL without a unique index. This `ON CONFLICT` target will error unless an implicit unique index exists from somewhere else. Flag for Step 1.
