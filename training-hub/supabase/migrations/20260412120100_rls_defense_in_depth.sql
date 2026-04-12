-- Defense-in-depth Row-Level Security for training-hub tables.
--
-- Background: every Next.js API route already uses the Supabase service
-- role key via createServerClient(), which bypasses RLS. The app has a
-- single HR admin user and no anon traffic to data tables. Enabling RLS
-- here is strictly defense-in-depth: if a future route accidentally uses
-- the anon key, or if someone queries the schema through the PostgREST
-- data API with a non-service key, the default policy is DENY.
--
-- Policy model:
--   service_role         → bypasses RLS, full access (Supabase default)
--   authenticated         → full read on ref tables; no direct write
--   anon                  → no access
--
-- Only two rows of intentional public surface exist:
--   (a) the /signin page performs a read-only roster lookup server-side
--       via the service role, so anon does NOT need employees SELECT.
--   (b) the /signin POST writes a training_records row server-side via
--       the service role, so anon does NOT need training_records INSERT.
-- Everything else is locked down.

-- ── Enable RLS on every data-bearing table ────────────────────────────
ALTER TABLE employees               ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_aliases        ENABLE ROW LEVEL SECURITY;
ALTER TABLE excusals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE required_trainings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE unknown_trainings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE unresolved_people       ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_settings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_fill_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nicknames               ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments             ENABLE ROW LEVEL SECURITY;

-- ── Authenticated users: read-only view of reference data ────────────
-- These policies only activate when the caller is NOT service_role
-- (service_role bypasses RLS entirely and continues to have full access).
CREATE POLICY "authenticated read employees"
  ON employees FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read training_records"
  ON training_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read training_types"
  ON training_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read training_aliases"
  ON training_aliases FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read excusals"
  ON excusals FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read required_trainings"
  ON required_trainings FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read unknown_trainings"
  ON unknown_trainings FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read unresolved_people"
  ON unresolved_people FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read imports"
  ON imports FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read hub_settings"
  ON hub_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read auto_fill_rules"
  ON auto_fill_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read nicknames"
  ON nicknames FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read training_sessions"
  ON training_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated read enrollments"
  ON enrollments FOR SELECT TO authenticated USING (true);

-- ── No policies for anon: anon access is fully denied by default ─────
-- (RLS with no matching policy = deny, which is the intended behavior.)

COMMENT ON POLICY "authenticated read employees" ON employees IS
  'Defense-in-depth: authenticated users can read roster. Writes still go through service_role RPC only.';
