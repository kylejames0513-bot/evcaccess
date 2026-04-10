# 09 DB Live

Source: Supabase project `EVC`, id `xkfvipcxnzwyskknkmpj`, region us-east-1, Postgres 17.6.1.104, created 2026-04-09.

## Tables in public schema

| table | rows | rls | notes |
|---|---|---|---|
| employees | 2225 | off | PK `id` uuid; has `employee_number`, `aliases[]`, `excusal_codes[]` |
| nicknames | 184 | off | name/alias pairs with `is_evc` flag |
| training_types | 39 | off | PK `id` int, `name` unique, `column_key` NOT unique |
| training_aliases | 25 | off | `alias` unique, FK to training_types |
| training_schedules | 0 | off | never used |
| auto_fill_rules | 3 | off | cpr->firstaid and med_train mirrors |
| training_rules | 0 | off | never populated, all dept rules live in hub_settings instead |
| training_sessions | 0 | off | scheduling table, empty |
| enrollments | 0 | off | empty |
| training_records | 1655 | off | has the review columns from migration 004 |
| excusals | 11562 | off | mostly auto generated; 11407 have source = 'merged_sheet' |
| notifications | 0 | off | empty |
| removal_log | 0 | off | empty |
| hub_settings | 12 | on | all 12 rows are `type='dept_rule'` |
| archived_sessions | 0 | on | empty |

## Views

- `employee_compliance` (matches source in migration 001)

## Functions

- `add_employee_alias(emp_id uuid, new_alias text)`
- `apply_auto_fill()` (trigger fn)
- `calculate_expiration()` (trigger fn)
- `update_updated_at()` (trigger fn)
- `upsert_employees_from_sheet(emps jsonb)` (two pass variant from migration 011)
- `rls_auto_enable()` (not in any repo migration — likely Supabase managed helper)

## Enums

`user_role`, `compliance_status`, `session_status`, `attendance_status`, `schedule_weekday` (all match migration 001).

## Indexes on employees

```
employees_pkey                       btree (id)
employees_auth_id_key                btree (auth_id) UNIQUE
employees_email_key                  btree (email) UNIQUE
employees_employee_number_unique     btree (employee_number) WHERE NOT NULL UNIQUE
employees_name_unique_ci             btree (lower(last_name), lower(first_name)) UNIQUE
idx_employees_unique_name            btree (lower(last_name), lower(first_name)) UNIQUE  <-- duplicate of employees_name_unique_ci
idx_employees_active                 btree (is_active) WHERE is_active = true
idx_employees_aliases                gin (aliases)
idx_employees_name                   btree (last_name, first_name)
```

Two identical unique CI indexes exist (`employees_name_unique_ci` and `idx_employees_unique_name`). One is dead weight.

## Indexes on training_records

```
training_records_pkey                   (id)
training_records_emp_type_date_unique   (employee_id, training_type_id, completion_date) UNIQUE
idx_records_employee                    (employee_id)
idx_records_type                        (training_type_id)
idx_records_expiration                  (expiration_date) WHERE NOT NULL
idx_records_pending_review              ((pass_fail IS NULL OR lower(pass_fail)='pending')) WHERE ...
```

## Indexes on training_types

Only `training_types_pkey` and `training_types_name_key`. No unique index on `column_key`, confirming that migration 003_seed_data's `ON CONFLICT (column_key)` from the repo would error. Live migration history shows that seed was applied under the name `cpr_firstaid_mirror_rule` instead, so the ON CONFLICT variant from the repo file was never actually run on the live DB.

## Migration history on the live DB

Live migration table shows 17 applied migrations (vs 12 files in the repo):

1. `001_initial_schema`
2. `002_hub_settings`
3. `003_employee_name_unique`  ← live only
4. `record_review_columns`
5. `employee_name_unique`  ← live only (duplicate of step 3)
6. `fix_auto_fill_recursion`
7. `training_records_dedupe_key`
8. `add_onboarding_training_types`  ← live only
9. `employee_name_unique_case_insensitive`  ← live only, this is what created `employees_name_unique_ci`
10. `add_employee_number`
11. `upsert_employees_from_sheet_rpc`
12. `add_employee_aliases`
13. `add_excusals_source`
14. `cpr_firstaid_mirror_rule`  ← replaces repo's `003_seed_data.sql`
15. `upsert_employees_with_aliases`
16. `add_vr_training_type`  ← live only
17. `upsert_employees_by_number_first`

Repo files `supabase/migrations/*.sql` and the live migration history are NOT the same list. The source folder was reconstructed after the fact and is missing at least 4 changes that only live in the database. Flag: the live DB is the real source of truth, not the repo.

## Sample rows

### employees (ordered by created_at desc)

| first_name | last_name | department | is_active | hire_date | employee_number |
|---|---|---|---|---|---|
| John | Zerga | Residential | false | 2025-07-23 | ZE02 |
| Jenny | Wagner | Residential | false | 2025-03-03 | WA15 |
| Hannah | Turner | Residential | false | 2025-07-22 | TU18 |
| Meagan | Peacock | Residential | false | 2023-06-06 | PE28 |
| Abbigail | Renner | Residential | false | null | RE26 |

`email`, `job_title`, `program`, and `aliases` are null/empty on all 5 recent rows.

### training_types (first 15)

| id | name | column_key | renewal_years | is_required | is_active |
|---|---|---|---|---|---|
| 1 | CPR/FA | CPR | 2 | true | true |
| 2 | Ukeru | Ukeru | 0 | false | true |
| 3 | Mealtime | Mealtime | 0 | false | true |
| 4 | Med Recert | MED_TRAIN | 3 | false | true |
| 5 | Initial Med Training | MED_TRAIN | 0 | false | true |
| 6 | Post Med | POST MED | 0 | false | true |
| 7 | POMs | POM | 0 | false | true |
| 8 | Person Centered | Pers Cent Thnk | 0 | false | true |
| 9 | Safety Care | Safety Care | 0 | false | true |
| 10 | Meaningful Day | Meaningful Day | 0 | false | true |
| 11 | MD Refresh | MD refresh | 0 | false | true |
| 12 | GERD | GERD | 0 | false | true |
| 13 | HCO Training | HCO Training | 0 | false | true |
| 14 | Health Passport | Health Passport | 0 | false | true |
| 15 | Diabetes | Diabetes | 0 | false | true |

Only `CPR/FA` (renewal 2 yr) and `Med Recert` (renewal 3 yr) have renewal windows. Every other training is one and done or has `renewal_years = 0`. Only `CPR/FA` has `is_required = true`. That plus the empty `training_rules` table means compliance requirements are ONLY coming from `hub_settings` dept rules, not the schema's proper rules tables.

### training_records (most recent 5)

| training | completion_date | expiration_date | source |
|---|---|---|---|
| Post Med | 2024-09-13 | null | merged_sheet |
| CPR/FA | 2026-02-12 | 2028-02-12 | merged_sheet |
| CPR/FA | 2024-07-11 | 2026-07-11 | merged_sheet |
| Initial Med Training | 2024-09-12 | null | merged_sheet |
| CPR/FA | 2024-08-01 | 2026-08-01 | merged_sheet |

### hub_settings (all 12 rows are dept_rule)

| department | value (tracked\|required) |
|---|---|
| Behavioral Health | Ukeru, CPR \| Ukeru, CPR |
| Board | \| |
| Children Services | CPR \| CPR |
| Community Engagement | CPR \| CPR |
| Executive | Ukeru, CPR \| Ukeru, CPR |
| Facilities | CPR \| CPR |
| Family Support | CPR, Ukeru \| CPR, Ukeru |
| Finance | CPR, Ukeru \| CPR, Ukeru |
| Human Resources | CPR, Ukeru \| CPR, Ukeru |
| Professional Services | CPR \| CPR |
| Residential | CPR, Mealtime, MED_TRAIN, Ukeru, POST MED \| CPR, Mealtime, MED_TRAIN, Ukeru, POST MED |
| Workforce Innovation | CPR \| CPR |

Format: `<tracked-csv>|<required-csv>` using `column_key` values, not canonical names. Parsed downstream in `lib/hub-settings.ts`.

## Summary counts

- `active_employees` = 387
- `inactive_employees` = 1838 (dominant: historical Paylocity churn loaded into the DB)
- `employees_without_number` = 1680 (most of those are probably the historicals; needs confirm)
- `training_records` rows by source: `merged_sheet` 838, `auto_fill` 529, `training_records_sheet` 288
- `excusals.source='merged_sheet'` = 11407 of 11562 (98.7%)
- `training_records.expiration_date IS NULL` where `renewal_years > 0` = 0 (the trigger works)

No SQL call in this scan exceeded the 30 second rule.
