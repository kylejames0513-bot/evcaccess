-- ============================================================
-- Hub Settings — key/value store for app configuration
-- ============================================================
-- Replaces the Google Sheets "Hub Settings" tab.
-- Same structure: type + key + value rows.
-- ============================================================

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

-- Trigger to update updated_at
CREATE TRIGGER trg_hub_settings_updated_at
  BEFORE UPDATE ON hub_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Archived sessions table (replaces "Archive" Google Sheet tab)
-- ============================================================

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
