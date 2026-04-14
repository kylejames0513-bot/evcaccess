-- Review queue for import rows whose person could not be matched to an
-- employees row. Per Kyle's rule: nothing fails silently. If the resolver
-- can't pin a row to a Paylocity ID and can't find a name match, it lands
-- here with the full raw payload preserved.
--
-- Reasons:
--   no_match        : neither paylocity_id nor name matched anything
--   ambiguous       : multiple employees matched the name
--   invalid_id      : paylocity_id present but does not exist in employees
--   name_collision  : name matched but to a row with a conflicting paylocity_id
--   special_status  : row was a special-status entry like Med Admin No Show
--                     that does not become a completion (PHS only)
--   name_map_no_match : during cutover stage 4, a hub_settings name_map
--                       row pointed at a name we could not find

CREATE TABLE IF NOT EXISTS unresolved_people (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id               UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  source                  TEXT NOT NULL,
  raw_payload             JSONB NOT NULL,
  last_name               TEXT,
  first_name              TEXT,
  full_name               TEXT,
  paylocity_id            TEXT,
  reason                  TEXT NOT NULL,
  suggested_employee_id   UUID REFERENCES employees(id),
  resolved_at             TIMESTAMPTZ,
  resolved_by             UUID REFERENCES auth.users(id),
  resolved_to_employee_id UUID REFERENCES employees(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unresolved_people_source_check
    CHECK (source IN ('paylocity', 'phs', 'access', 'signin', 'manual', 'cutover')),
  CONSTRAINT unresolved_people_reason_check
    CHECK (reason IN ('no_match', 'ambiguous', 'invalid_id', 'name_collision', 'special_status', 'name_map_no_match'))
);

CREATE INDEX IF NOT EXISTS idx_unresolved_people_import
  ON unresolved_people (import_id);

CREATE INDEX IF NOT EXISTS idx_unresolved_people_open
  ON unresolved_people (created_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_unresolved_people_paylocity_id
  ON unresolved_people (paylocity_id)
  WHERE paylocity_id IS NOT NULL;

COMMENT ON TABLE unresolved_people IS
  'Review queue for import rows whose person could not be matched to an employee.';
