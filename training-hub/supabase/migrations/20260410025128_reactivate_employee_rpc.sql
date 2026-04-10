-- Reactivate an orphaned (former) employee profile and assign a new
-- Paylocity ID to it. Per Kyle: "if they get rehired, they should just
-- have their old orphaned profile reactivated with the new id."
--
-- Caller is the resolver during ingest. The flow is:
--   1. Resolver sees a Paylocity row with employee_number = X
--   2. No existing employee has paylocity_id = X
--   3. Resolver looks up by name and finds an existing row that has
--      is_active = false and paylocity_id IS NULL (orphaned former
--      employee). At most one such match.
--   4. Resolver calls this RPC with that orphan's id and the new X.
--
-- Returns the updated row id so the resolver can immediately attach
-- training records to it.
--
-- Safeguards:
--   - Only fires if the target row currently has paylocity_id IS NULL.
--   - Only fires if the target row is currently is_active = false.
--   - Only fires if no other row already has the new paylocity_id.
--   - All three checks are inside the function so a buggy caller can't
--     accidentally clobber an active employee.

CREATE OR REPLACE FUNCTION reactivate_employee_with_paylocity_id(
  orphan_id          UUID,
  new_paylocity_id   TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  conflict_id UUID;
BEGIN
  IF new_paylocity_id IS NULL OR length(trim(new_paylocity_id)) = 0 THEN
    RAISE EXCEPTION 'reactivate_employee_with_paylocity_id: new_paylocity_id is required';
  END IF;

  -- Make sure the new paylocity_id isn't already taken by someone else
  SELECT id INTO conflict_id
    FROM employees
   WHERE paylocity_id = new_paylocity_id
     AND id <> orphan_id
   LIMIT 1;

  IF conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'reactivate_employee_with_paylocity_id: paylocity_id % already assigned to %', new_paylocity_id, conflict_id;
  END IF;

  UPDATE employees
     SET is_active      = true,
         paylocity_id   = new_paylocity_id,
         employee_number = COALESCE(employee_number, new_paylocity_id),
         reactivated_at = now(),
         terminated_at  = NULL,
         updated_at     = now()
   WHERE id = orphan_id
     AND is_active = false
     AND paylocity_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reactivate_employee_with_paylocity_id: no orphaned row found for id % (must be is_active=false and paylocity_id IS NULL)', orphan_id;
  END IF;

  RETURN orphan_id;
END;
$$;

COMMENT ON FUNCTION reactivate_employee_with_paylocity_id(UUID, TEXT) IS
  'Reactivate an orphaned former employee profile and assign a new '
  'Paylocity ID. Used by the resolver during ingest.';
