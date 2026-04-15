-- Optional gated roster: Excel sync batches land here until HR approves.
-- When HUB_ROSTER_SYNC_GATED is not set, sync routes behave as before.

CREATE TABLE pending_roster_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN ('new_hires_batch', 'separations_batch')),
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'failed')),
  source          TEXT NOT NULL DEFAULT 'excel_vba',
  error_message   TEXT,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_pending_roster_events_status ON pending_roster_events (status) WHERE status = 'pending';
CREATE INDEX idx_pending_roster_events_created ON pending_roster_events (created_at DESC);

COMMENT ON TABLE pending_roster_events IS 'Option B roster queue: VBA sync can enqueue here when HUB_ROSTER_SYNC_GATED=true; HR approves via /roster-queue.';
