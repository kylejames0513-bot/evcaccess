# 09 DB Live

## Status: BLOCKED

The step 0 brief says to hit the live Supabase via the Supabase MCP tools. This session has no Supabase MCP server available. The only MCP tools exposed are the GitHub MCP tools scoped to `kylejames0513-bot/evcaccess`. Specifically, none of the following are present:

- `list_tables`
- `execute_sql` (or any query tool)
- any `mcp__supabase__*` tool

I did not guess at the live DB shape. The target model in section 6 of the brief says "scan the live Supabase, tell me which of these already exist (under any name), which are partially there, and which are missing", and that requires real queries.

## What I can infer without hitting the database

From the migration files in `training-hub/supabase/migrations/` (scanned in chunks 04, 05a, 05b, 05c, 05d), the following tables and types are defined in source. Whether they actually exist on the live DB, match the source, or have drift, is unverified.

Tables defined in migrations:

- `employees` (001, extended by 005, 006, 008)
- `nicknames` (001)
- `training_types` (001)
- `training_aliases` (001)
- `training_schedules` (001)
- `auto_fill_rules` (001)
- `training_rules` (001)
- `training_sessions` (001)
- `enrollments` (001)
- `training_records` (001, extended by 004, 006_fix)
- `excusals` (001, extended by 009)
- `notifications` (001)
- `removal_log` (001)
- `hub_settings` (002)
- `archived_sessions` (002)

Views defined in migrations:

- `employee_compliance` (001)

Functions defined in migrations:

- `calculate_expiration()` (001)
- `apply_auto_fill()` (001, replaced in 006_fix)
- `update_updated_at()` (001)
- `upsert_employees_from_sheet(jsonb)` (007, replaced in 010, replaced in 011)
- `add_employee_alias(uuid, text)` (008)

Enums defined in migrations:

- `user_role`
- `compliance_status`
- `session_status`
- `attendance_status`
- `schedule_weekday`

## What needs verification from live DB

1. Row counts for every table.
2. Whether migration 003's `ON CONFLICT (column_key)` ever succeeded (depends on a unique index on `column_key` that no migration creates).
3. Whether the functional index `employees_name_unique_ci` on `(lower(last_name), lower(first_name))` exists. Migration 007 and 010 and 011 all target it, but no migration creates it.
4. Whether there is any schema drift between live and source (e.g. columns added manually in the Supabase SQL editor).
5. Live sample rows from `employees`, `training_types`, `training_records`, `hub_settings`.
6. Whether any imports-specific tables (ingest log, unresolved_people, unknown_trainings from section 6 of the brief) already exist. On source, they do not.

## How to unblock

Pick one of:

1. **Attach the Supabase MCP server to this session.** Preferred. Once it's wired up I can run the ten queries on the spot and fill this file in properly.
2. **Paste the output manually.** Run the following three SQL blocks against your live Supabase in the dashboard SQL editor and paste the results back. I will write them into this file verbatim.

### Queries to run manually if you go route 2

```sql
-- 1. List tables in public schema
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

```sql
-- 2. Columns for every public table
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

```sql
-- 3. Row counts for core tables (run one at a time, capped)
SELECT 'employees' AS t, count(*) FROM employees
UNION ALL SELECT 'training_types', count(*) FROM training_types
UNION ALL SELECT 'training_aliases', count(*) FROM training_aliases
UNION ALL SELECT 'training_rules', count(*) FROM training_rules
UNION ALL SELECT 'training_sessions', count(*) FROM training_sessions
UNION ALL SELECT 'enrollments', count(*) FROM enrollments
UNION ALL SELECT 'training_records', count(*) FROM training_records
UNION ALL SELECT 'excusals', count(*) FROM excusals
UNION ALL SELECT 'hub_settings', count(*) FROM hub_settings
UNION ALL SELECT 'archived_sessions', count(*) FROM archived_sessions
UNION ALL SELECT 'nicknames', count(*) FROM nicknames;
```

```sql
-- 4. Samples, capped at 5 rows each
SELECT * FROM employees LIMIT 5;
SELECT * FROM training_types LIMIT 5;
SELECT * FROM training_records ORDER BY created_at DESC LIMIT 5;
SELECT * FROM hub_settings LIMIT 5;
```

```sql
-- 5. Functional index sanity check
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'employees';
```

Paste the results of those blocks in chat and I will finish chunk 09 and proceed to chunk 10.
