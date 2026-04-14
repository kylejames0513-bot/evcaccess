-- Follow-up from the security advisor after enabling RLS.
--
-- Part 1: Three critical views (employee_compliance, master_completions,
-- employee_history) were running as SECURITY DEFINER, which means they
-- bypass the RLS that was just enabled on their underlying tables.
-- Flip them to security_invoker so RLS actually applies to non-service-role
-- callers. No API behavior change: the server continues to use the service
-- role, which bypasses RLS regardless.
ALTER VIEW public.employee_compliance SET (security_invoker = on);
ALTER VIEW public.master_completions   SET (security_invoker = on);
ALTER VIEW public.employee_history     SET (security_invoker = on);

-- Part 2: Pin a stable search_path on every flagged public function.
-- A mutable search_path is a classic privilege-escalation vector when
-- the function runs as SECURITY DEFINER (which most of these do),
-- because a caller can prepend their own schema and shadow built-in
-- functions/tables. Setting it explicitly eliminates that class of
-- attack.
ALTER FUNCTION public.update_updated_at()                                      SET search_path = public, pg_catalog;
ALTER FUNCTION public.calculate_expiration()                                   SET search_path = public, pg_catalog;
ALTER FUNCTION public.add_employee_alias(emp_id uuid, new_alias text)          SET search_path = public, pg_catalog;
ALTER FUNCTION public.apply_auto_fill()                                        SET search_path = public, pg_catalog;
ALTER FUNCTION public.upsert_employees_from_sheet(emps jsonb)                  SET search_path = public, pg_catalog;
ALTER FUNCTION public.reactivate_employee_with_paylocity_id(orphan_id uuid, new_paylocity_id text) SET search_path = public, pg_catalog;
ALTER FUNCTION public.commit_import(p_import_id uuid)                          SET search_path = public, pg_catalog;
