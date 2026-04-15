-- Manual roster lock: HR can mark prestaged sessions so auto-prune and auto-fill never touch them.
-- Still combined with the app-wide rule: within 14 days of session_date, automation is always off.

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS roster_manual_lock boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.training_sessions.roster_manual_lock IS 'When true, auto-prune and auto-fill skip this session regardless of date. Also auto-skipped when session_date is within 14 days of today.';
