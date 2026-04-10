-- Track terminations and rehires explicitly. Additive only.
--
-- terminated_at: when the employee was last marked is_active=false.
-- reactivated_at: when an orphaned (is_active=false, no paylocity_id) row
--                 was rehired and assigned a fresh Paylocity ID. Per Kyle:
--                 returning employees reactivate their old profile, they
--                 do not get a brand new row.
-- position: distinct from job_title. Used by the new required_trainings
--           table to support per-position overrides inside a department
--           (e.g. case management inside Residential needs Med Cert when
--           others in the same department do not). job_title remains for
--           HR display.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS terminated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS position       TEXT;

CREATE INDEX IF NOT EXISTS idx_employees_position
  ON employees (lower(position))
  WHERE position IS NOT NULL;

COMMENT ON COLUMN employees.terminated_at IS
  'Set when is_active flips to false. Cleared on reactivation.';
COMMENT ON COLUMN employees.reactivated_at IS
  'Set when a former employee row is rehired with a new Paylocity ID. '
  'See reactivate_employee_with_paylocity_id RPC.';
COMMENT ON COLUMN employees.position IS
  'Strict position used for required_trainings matching. Distinct from '
  'job_title which is HR display only.';
