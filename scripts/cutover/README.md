# Cutover Stage 5: Historical Data Ingest

This folder contains the scripts and pre-built SQL needed to bulk-load
the historical training data from `Google Sheets/EVC_Attendance_Tracker (2).xlsx`
into the Supabase tables created in Step 2.1.

## What ships here

- `extract_xlsx.py` reads the workbook and writes JSONL files to
  `/tmp/evc_cutover/<source>.jsonl`. Run this to refresh the
  intermediate output if the workbook changes.
- `build_sql.py` reads those JSONL files and emits batched
  `WITH source_rows ... INSERT ... ON CONFLICT DO NOTHING` statements
  into `sql/`. Each file is one independent statement.
- `sql/` is the pre-built SQL ready to apply. 35 files in load order.

The SQL is committed to the repo so the bulk load can be reviewed
before running.

## Why this is a script and not a migration

The historical bulk load is one shot. It is not part of the schema and
should not run again on a clean database (`supabase db push` already
applies the schema migrations under `training-hub/supabase/migrations/`).
The SQL here is intentionally outside the migrations folder so a future
db reset does not replay it.

## How to apply (manual, ~3 minutes)

Open the Supabase SQL editor for the EVC project
(`xkfvipcxnzwyskknkmpj`) and run the files in numeric order:

```
01_employees_01.sql
01_employees_02.sql
01_employees_03.sql
02_access_01.sql ... 02_access_21.sql
03_paylocity_01.sql ... 03_paylocity_03.sql
04_phs_01.sql ... 04_phs_03.sql
05_signin_01.sql
```

Each file is one self-contained `WITH ... INSERT ... ON CONFLICT DO NOTHING`
statement. Order matters: employees first, then everything that joins
employees by name or paylocity_id.

After all 35 files complete, run the verification queries below to
confirm the load.

## Verification queries

```sql
-- Active vs terminated counts (should match xlsx Employees tab)
SELECT
  count(*) FILTER (WHERE is_active) AS active,
  count(*) FILTER (WHERE NOT is_active) AS terminated
FROM employees;

-- Training records by source after the load
SELECT source, count(*) FROM training_records GROUP BY source ORDER BY count DESC;

-- Excusals by source after the load
SELECT source, count(*) FROM excusals GROUP BY source ORDER BY count DESC;

-- Sanity peek at the compliance view
SELECT status, count(*) FROM employee_compliance GROUP BY status;
```

Expected ranges based on the xlsx contents:

| Source | Approx new training_records |
|---|---|
| `access` | up to 8388 (the wide matrix pivot, dedup will collapse some) |
| `paylocity` | up to 1219 |
| `phs` | up to 1280 |
| `signin` | up to 453 |

Plus pre-existing rows that survive deduplication via the
`(employee_id, training_type_id, completion_date)` unique index.

## Things the script does NOT do (intentional)

1. **Rehire detection.** When a Paylocity row references an
   `employee_number` that does not exist in the DB, the row is
   silently dropped instead of being routed through the
   `reactivate_employee_with_paylocity_id` RPC. Reasoning: the rehire
   path is best handled interactively in the resolution review UI
   after the bulk load, so a human can confirm each rehire.
2. **Unmatched-row review queue population.** Dropped rows do NOT get
   logged to `unresolved_people` from this script. The new resolver
   pipeline (`src/lib/resolver/`) does this automatically when used
   via the imports UI; for the bulk historical load we accept that
   unmatched rows are simply not loaded.
3. **Fuzzy matching.** Same reason as 1: best done interactively after
   the bulk load completes.
4. **Aliases generation from sources.** The cutover Stage 4 migrations
   already populated employee aliases from the legacy `name_map` rows
   plus the quoted/parens preferred-name forms in `first_name`. The
   bulk load script does not add to that.

If any of those matter for the historical load, run the imports
through the new imports UI in the rebuilt hub instead of this script,
which gives full resolver semantics.
