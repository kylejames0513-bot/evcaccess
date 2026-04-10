# Migration Drift Reset

Date: 2026-04-10
Project: Supabase `EVC` (`xkfvipcxnzwyskknkmpj`)

## Why this happened

Before this commit, `training-hub/supabase/migrations/` contained 12 hand-numbered files (`001` through `011`, with two files prefixed `006`). The live Supabase database had 17 migrations applied. The two lists were not in sync. Several SQL clauses in the source files referenced indexes that did not exist in source (`employees_name_unique_ci`, the `column_key` conflict target), and several changes that DID exist on the live DB had no source counterpart at all. The source folder was effectively decorative.

## What I did

Pulled the actual `statements[]` text out of `supabase_migrations.schema_migrations` for every applied migration on the live database, deleted the 12 stale source files, and wrote 17 new files in their place using the live versions verbatim. Filenames now follow Supabase CLI convention `<version>_<name>.sql` so a future `supabase db reset` or `supabase db push` will treat them as the canonical source.

## File mapping

Old hand-numbered file (deleted) → new live-versioned file (added):

| old | new |
|---|---|
| `001_initial_schema.sql` | `20260409010504_001_initial_schema.sql` |
| `002_hub_settings.sql` | `20260409010511_002_hub_settings.sql` |
| (none, repo was missing this) | `20260409021554_003_employee_name_unique.sql` |
| `004_record_review_columns.sql` | `20260409140201_record_review_columns.sql` |
| `005_employee_name_unique.sql` | `20260409140236_employee_name_unique.sql` |
| `006_fix_auto_fill_recursion.sql` (1st half) | `20260409141436_fix_auto_fill_recursion.sql` |
| `006_fix_auto_fill_recursion.sql` (2nd half) | `20260409141503_training_records_dedupe_key.sql` |
| (none, repo was missing this) | `20260409142216_add_onboarding_training_types.sql` |
| (none, repo was missing this) | `20260409144927_employee_name_unique_case_insensitive.sql` |
| `006_employee_number.sql` | `20260409152107_add_employee_number.sql` |
| `007_upsert_employees_rpc.sql` | `20260409154343_upsert_employees_from_sheet_rpc.sql` |
| `008_employee_aliases.sql` | `20260409160932_add_employee_aliases.sql` |
| `009_excusals_source.sql` | `20260409161950_add_excusals_source.sql` |
| `003_seed_data.sql` (broken `ON CONFLICT (column_key)`) | `20260409162045_cpr_firstaid_mirror_rule.sql` (correct version, looks up via `column_key` lookups in DO block) |
| `010_upsert_aliases.sql` | `20260409163507_upsert_employees_with_aliases.sql` |
| (none, repo was missing this) | `20260409170443_add_vr_training_type.sql` |
| `011_upsert_by_employee_number.sql` | `20260409173443_upsert_employees_by_number_first.sql` |

Net change: 12 files removed, 17 files written. The 5 files that did not exist in source before are the four "live only" migrations from the Step 0 inventory (`003_employee_name_unique`, `add_onboarding_training_types`, `employee_name_unique_case_insensitive`, `add_vr_training_type`) plus the recovered `cpr_firstaid_mirror_rule` (which the repo had as `003_seed_data.sql` but with a broken `ON CONFLICT (column_key)` clause that would not match any actual index).

## Verification

These files were not run against the live DB. Live DB is unchanged. `supabase_migrations.schema_migrations` already contains rows for every version listed above, so a `supabase db push` against this folder is a no-op (everything is already applied).

Confirmation queries you can run after pulling this commit:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

That list should match exactly the filenames in `training-hub/supabase/migrations/` (minus the `.sql` extension).

## Known leftover issues that this regen does NOT fix

These were noted in `docs/inventory/10_gaps.md` and remain in scope for Step 2:

- Two functionally identical unique CI indexes on employees: `employees_name_unique_ci` and `idx_employees_unique_name`. Step 2 should pick one and drop the other.
- `training_types.column_key` is still not unique even though it's used as a lookup in `cpr_firstaid_mirror_rule`. The DO block works because it does `SELECT id INTO ... WHERE column_key = 'CPR'`, which tolerates multiple matches by returning the first. If duplicate `MED_TRAIN` rows ever cause it to return the wrong id this becomes a real bug.
- Empty tables (`training_rules`, `training_sessions`, `enrollments`, `notifications`, `removal_log`, `archived_sessions`, `training_schedules`) are still in the schema. The Step 1 plan will decide which to keep, which to repurpose, and which to drop.
- `training_rules` will be replaced or augmented by a new `required_trainings` table that supports `(department, position, training_type_id)` keying so Kyle can override per-position within a department.
