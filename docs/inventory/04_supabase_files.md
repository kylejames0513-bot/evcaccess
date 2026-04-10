# 04 Supabase Files

All paths relative to `training-hub/supabase/`.

## config.toml

Not present. The repo has no `supabase/config.toml`. There is no Supabase CLI project bootstrap.

## Files

| Path | Lines |
|---|---|
| migrations/001_initial_schema.sql | 356 |
| migrations/002_hub_settings.sql | 39 |
| migrations/003_seed_data.sql | 61 |
| migrations/004_record_review_columns.sql | 25 |
| migrations/005_employee_name_unique.sql | 18 |
| migrations/006_employee_number.sql | 16 |
| migrations/006_fix_auto_fill_recursion.sql | 58 |
| migrations/007_upsert_employees_rpc.sql | 42 |
| migrations/008_employee_aliases.sql | 35 |
| migrations/009_excusals_source.sql | 19 |
| migrations/010_upsert_aliases.sql | 46 |
| migrations/011_upsert_by_employee_number.sql | 91 |

Total: 806 lines across 12 migration files.

## Migration filenames in order

1. `001_initial_schema.sql`
2. `002_hub_settings.sql`
3. `003_seed_data.sql`
4. `004_record_review_columns.sql`
5. `005_employee_name_unique.sql`
6. `006_employee_number.sql`
7. `006_fix_auto_fill_recursion.sql`  (note: duplicate `006` prefix collision)
8. `007_upsert_employees_rpc.sql`
9. `008_employee_aliases.sql`
10. `009_excusals_source.sql`
11. `010_upsert_aliases.sql`
12. `011_upsert_by_employee_number.sql`

Heads up: there are two files numbered `006`. Order between them is alphabetical, so `006_employee_number.sql` runs before `006_fix_auto_fill_recursion.sql`. Worth flagging for the migration plan in Step 1.
