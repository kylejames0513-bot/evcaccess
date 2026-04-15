-- Prevent double-approval races by allowing an in-flight processing state.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pending_roster_events_status_check'
      AND conrelid = 'public.pending_roster_events'::regclass
  ) THEN
    ALTER TABLE public.pending_roster_events
      DROP CONSTRAINT pending_roster_events_status_check;
  END IF;
END $$;

ALTER TABLE public.pending_roster_events
  ADD CONSTRAINT pending_roster_events_status_check
  CHECK (status IN ('pending', 'processing', 'approved', 'denied', 'failed'));
