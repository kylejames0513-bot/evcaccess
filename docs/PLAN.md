# EVC Training Hub Rework: Plan

This is the Step 1 plan that turns the Step 0 inventory into a concrete build sequence. It assumes everything in `docs/inventory/01_tree.md` through `11_import_formats.md` and `docs/MIGRATION_DRIFT.md` as background. Decisions reflect Kyle's answers in chat: CPR universal, dept + position scoped requirements editable from the UI, all historical data ingested, rehires reactivate orphaned profiles with a fresh ID, 30 day DUE_SOON window with a 90 / 60 / 30 / overdue notification ladder, terminated employees tracked but hidden from compliance dashboard, Kyle as sole initial Auth admin, regenerated migration source folder is the new baseline.

---

## 1. Schema changes

Every change is a new migration file under `training-hub/supabase/migrations/`. Filenames use the Supabase CLI convention `<UTC-yyyymmddHHMMSS>_<name>.sql` so they sort after the existing 17 baseline files. Nothing in the existing 17 is rewritten in place; corrections happen as forward migrations.

### 1.1 Cleanup migrations (no behavior change, low risk)

1. **`drop_duplicate_name_index.sql`**
   Drop the redundant `idx_employees_unique_name` (functionally identical to `employees_name_unique_ci`).
2. **`drop_unused_legacy_tables.sql`**
   `DROP TABLE` for `nicknames`, `training_schedules`, `removal_log`, `archived_sessions`, `notifications`. All zero rows on live, none are referenced by the rework's target features. `removal_log` and `notifications` may be revived later inside the new `imports` / `audit_log` model; leaving them around now just confuses the schema.
3. **`fix_training_types_column_key.sql`**
   The `column_key` column is currently NOT unique even though several spots upsert against it. Add a `column_key_normalized` generated column (`lower(column_key)`) and a partial unique index on it WHERE `is_active`. Keeps the current duplicates (`MED_TRAIN` x2) working and prevents future ones for active rows.

### 1.2 Core model migrations

4. **`employees_paylocity_id_promotion.sql`**
   Rename `employees.employee_number` to `paylocity_id` and add a comment documenting that this is the canonical join key per Section 4 of the brief. Add `position` TEXT column (currently job_title doubles as that, but Paylocity export has a distinct `Position Title` field; `job_title` stays for HR display, `position` is the strict column used by `required_trainings` matching).
   Keeps `employees.is_active` as the soft-delete flag for terminated employees.

5. **`employees_status_columns.sql`**
   Add `terminated_at TIMESTAMPTZ` (nullable). When ingest sees a row whose `Status='Terminated'` it sets `is_active=false` and `terminated_at=now()` if not already set. Add `reactivated_at TIMESTAMPTZ` (nullable) to record rehires.

6. **`required_trainings_table.sql`**
   New table replacing the dept_rule rows in `hub_settings`:
   ```
   required_trainings (
     id              SERIAL PK,
     training_type_id INT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
     department      TEXT,           -- nullable: NULL means "applies to every department"
     position        TEXT,           -- nullable: NULL means "applies to every position in the department"
     is_required     BOOLEAN NOT NULL DEFAULT true,
     is_universal    BOOLEAN NOT NULL DEFAULT false,  -- true = applies to every active employee, ignores dept/position
     notes           TEXT,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     CHECK (is_universal OR department IS NOT NULL),
     UNIQUE (training_type_id, COALESCE(department, ''), COALESCE(position, ''))
   )
   ```
   Indexes on `(department)`, `(department, position)`, and `(is_universal) WHERE is_universal`.
   Seed: one row with `is_universal=true` for CPR/FA. Then one row per current `dept_rule` Hub Setting (12 rows from `11_import_formats.md`).

7. **`training_aliases_v2.sql`**
   Extend the existing `training_aliases` table with a `source` column (TEXT, default `'manual'`) so we can track whether an alias comes from `paylocity`, `phs`, `access`, `signin`, or HR-entered. Backfill all existing 25 rows to `source='manual'`. Indexes: `(lower(alias))` and `(source)`.

8. **`unresolved_people_table.sql`**
   ```
   unresolved_people (
     id            UUID PK DEFAULT gen_random_uuid(),
     import_id     UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
     source        TEXT NOT NULL,        -- 'paylocity' | 'phs' | 'access' | 'signin'
     raw_payload   JSONB NOT NULL,       -- whole source row, untouched
     last_name     TEXT,
     first_name    TEXT,
     full_name     TEXT,
     paylocity_id  TEXT,
     reason        TEXT NOT NULL,        -- 'no_match' | 'ambiguous' | 'invalid_id' | 'name_collision'
     suggested_employee_id UUID REFERENCES employees(id),
     resolved_at   TIMESTAMPTZ,
     resolved_by   UUID REFERENCES auth.users(id),
     resolved_to_employee_id UUID REFERENCES employees(id),
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   )
   ```
   Indexes on `import_id`, `resolved_at IS NULL`, `paylocity_id`.

9. **`unknown_trainings_table.sql`**
   ```
   unknown_trainings (
     id            UUID PK DEFAULT gen_random_uuid(),
     import_id     UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
     source        TEXT NOT NULL,
     raw_name      TEXT NOT NULL,        -- the training name as it appeared in the source
     raw_payload   JSONB NOT NULL,
     occurrence_count INT NOT NULL DEFAULT 1,
     suggested_training_type_id INT REFERENCES training_types(id),
     resolved_at   TIMESTAMPTZ,
     resolved_by   UUID REFERENCES auth.users(id),
     resolved_to_training_type_id INT REFERENCES training_types(id),
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (import_id, source, lower(raw_name))
   )
   ```
   Resolution writes a new `training_aliases` row with the appropriate `source` value AND backfills any historical `unknown_trainings` rows that match.

10. **`imports_table.sql`**
    The run log table. Replaces the `sync_log` rows in `hub_settings`.
    ```
    imports (
      id            UUID PK DEFAULT gen_random_uuid(),
      source        TEXT NOT NULL,        -- 'paylocity' | 'phs' | 'access' | 'signin' | 'manual'
      filename      TEXT,
      uploaded_by   UUID REFERENCES auth.users(id),
      started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at   TIMESTAMPTZ,
      status        TEXT NOT NULL DEFAULT 'preview',  -- 'preview' | 'committed' | 'failed' | 'rolled_back'
      rows_in       INT,
      rows_added    INT,
      rows_updated  INT,
      rows_skipped  INT,
      rows_unresolved INT,
      rows_unknown  INT,
      error         TEXT,
      preview_payload JSONB,
      committed_at  TIMESTAMPTZ
    )
    ```
    Indexes on `started_at DESC`, `status WHERE status='preview'`.

### 1.3 Compliance + view migrations

11. **`compliance_view_v2.sql`**
    Replace `employee_compliance` with a new view that:
    - Joins `required_trainings` (universal + dept + dept+position) instead of `tt.is_required`.
    - Uses 30 day DUE_SOON instead of 60.
    - Adds three notification tier columns: `due_in_90`, `due_in_60`, `due_in_30`, `days_overdue`.
    - Filters `WHERE employees.is_active = true` (terminated employees excluded from this view).
    - One row per (employee, required_training). NEVER_COMPLETED is a valid status now.
    Status enum stays the same five values (`current`, `expiring_soon`, `expired`, `needed`, `excused`) so the existing client doesn't break, but `expiring_soon` now means "within 30 days" not 60.

12. **`master_completions_view.sql`**
    `master_completions` view: per (employee_id, training_type_id), the latest completion across all sources, plus the winning source. Used by employee detail page and the compliance calculator to show "this date came from PHS on 2024-09-12" provenance.

13. **`employee_history_view.sql`**
    `employee_history` view: full audit trail per employee across `training_records` joined with sources. Used by the employee detail page (target feature 7.6) including for terminated employees.

### 1.4 RPCs (data access functions)

14. **`reactivate_employee_rpc.sql`**
    `reactivate_employee_with_paylocity_id(orphan_id uuid, new_paylocity_id text)` SECURITY INVOKER. Sets `is_active=true`, `paylocity_id=new_paylocity_id`, `reactivated_at=now()`. Used by the resolver during ingest when a Paylocity row matches an orphaned (no paylocity_id, is_active=false) employee by name.

15. **`commit_import_rpc.sql`**
    `commit_import(import_id uuid)` SECURITY INVOKER that takes a previewed `imports.preview_payload` and writes the rows to `employees`, `training_records`, `unresolved_people`, `unknown_trainings` in a single transaction, then flips `imports.status='committed'`.

### 1.5 Migration order recap

```
20260410xxxxxx_drop_duplicate_name_index.sql
20260410xxxxxx_drop_unused_legacy_tables.sql
20260410xxxxxx_fix_training_types_column_key.sql
20260410xxxxxx_employees_paylocity_id_promotion.sql
20260410xxxxxx_employees_status_columns.sql
20260410xxxxxx_required_trainings_table.sql
20260410xxxxxx_training_aliases_v2.sql
20260410xxxxxx_imports_table.sql           # imports must exist before unresolved_people / unknown_trainings reference it
20260410xxxxxx_unresolved_people_table.sql
20260410xxxxxx_unknown_trainings_table.sql
20260410xxxxxx_compliance_view_v2.sql
20260410xxxxxx_master_completions_view.sql
20260410xxxxxx_employee_history_view.sql
20260410xxxxxx_reactivate_employee_rpc.sql
20260410xxxxxx_commit_import_rpc.sql
```
15 new migrations. None DROP a column or destroy data on the live DB; the riskiest ones are the legacy table drops, all of which are confirmed empty per chunk 09. The DROP migration will include explicit `IF EXISTS` and a comment with the row count snapshot at write time so a future reviewer can audit.

---

## 2. Lib and data access

`training-hub/src/lib/training-data.ts` is 919 lines today and is the single largest file in the repo. It does everything: reads, writes, formatting, normalization. The rework splits it into a typed data access layer under `src/lib/db/` so each concern is testable in isolation.

### 2.1 New folder layout

```
src/lib/
  supabase.ts                 (kept, unchanged)
  db/
    index.ts                  re-exports everything below
    employees.ts              CRUD + lookups for employees
    trainings.ts              training_types + training_aliases CRUD
    completions.ts            training_records reads/writes
    excusals.ts               excusals CRUD
    requirements.ts           required_trainings CRUD + matcher (which trainings does employee X need)
    imports.ts                imports table CRUD + commit_import RPC wrapper
    resolution.ts             unresolved_people + unknown_trainings CRUD
    compliance.ts             reads from employee_compliance view + aggregates
    history.ts                reads from employee_history + master_completions
  resolver/
    index.ts                  main resolver entry: takes a parsed import row, returns canonical (paylocity_id, training_type_id, completion_date) or routes to a review queue
    paylocity.ts              parser for Paylocity CSVs (25 cols)
    phs.ts                    parser for PHS CSVs (7 cols)
    access.ts                 parser for the wide Access matrix (37 cols)
    signin.ts                 parser for the public sign-in form payload
    name-match.ts             alias-aware name matching (consumes employees.aliases + employees_name_unique_ci)
    training-match.ts         alias-aware training matching (consumes training_aliases including by source)
    date-parse.ts             handles MM/DD/YYYY, YYYY-MM-DD, Excel serial dates
    rehire.ts                 implements the "if no employee_number match, look for orphaned (is_active=false, paylocity_id IS NULL) row by name and reactivate" rule
  notifications/
    tiers.ts                  pure function: given (expiration_date, today) -> 'overdue' | 'due_30' | 'due_60' | 'due_90' | 'ok'
  format-utils.ts             (kept)
  use-fetch.ts                (kept)
```

### 2.2 Files to delete or fold in

- `lib/exclude-list.ts`: dead, duplicates `hub-settings.ts`. Delete.
- `lib/capacity-overrides.ts`: dead, duplicates `hub-settings.ts`. Delete.
- `lib/training-data.ts`: split into `db/` and `resolver/` modules above. Delete the file once every API route has been migrated to the new modules.
- `lib/training-match.ts`: superseded by `resolver/training-match.ts`. Delete.
- `lib/name-utils.ts`: superseded by `resolver/name-match.ts`. Delete after API routes migrate.
- `lib/import-utils.ts`: superseded by `resolver/`. Delete.
- `lib/hub-settings.ts`: keep for now (it owns the read/write of `hub_settings` rows that are NOT being migrated, like `capacity` and `name_map` until the alias migration is done). Delete after Step 2.6.
- `config/trainings.ts` and `config/primary-trainings.ts`: hard-coded TRAINING_DEFINITIONS array that duplicates rows already in the live DB. Delete once `db/trainings.ts` is reading from Supabase everywhere.

### 2.3 Generated types

After migration set runs, run `supabase gen types typescript --project-id xkfvipcxnzwyskknkmpj > src/types/database.generated.ts` and commit. The hand-written `src/types/database.ts` becomes a thin re-export of the generated file plus a few app-level type aliases (`EmployeeRow = Database['public']['Tables']['employees']['Row']` etc.).

### 2.4 Server vs client split

Every file under `src/lib/db/` is server-only. They import `createServerClient()` from `lib/supabase.ts` and use the service role key. None of them are imported into a `"use client"` page directly; pages call API routes under `src/app/api/`, which call `db/`. This stops the service role key from leaking to the browser bundle and lets us add Supabase Auth row level security without rewriting client code.

### 2.5 Tests

The two pieces that have testable logic are `resolver/` and `notifications/tiers.ts`. Adding a `vitest` setup with maybe 20 tests covering:
- Each parser against a fixture CSV / fixture matrix row
- Name matching with aliases
- Training matching across source variants
- Date parsing edge cases (Excel serials, two digit years, MM/DD vs DD/MM ambiguity)
- The notification tier function across boundary days (today, +29, +30, +59, +60, +89, +90, +91, -1, -29)

`vitest` is a single dev dependency, doesn't change runtime behavior, and matches what most Next 16 examples ship with. If Kyle wants to skip tests for v1 they can be deleted; I'd rather have them since the resolver is the part that's most likely to corrupt data silently.

---

## 3. UI screens

The current app has 16 client pages and 40 API routes. Per chunk 06, every page already uses `"use client"`. The rework keeps the same App Router layout but reshapes pages around the 8 target features in section 7 of the brief. Status legend: **KEEP** = leave alone, **FIX** = significant rework, **BUILD** = greenfield, **DELETE** = remove.

### 3.1 Per-target-feature audit

| Target feature | Current state | Action |
|---|---|---|
| 7.1 Auth + roles | `/login` exists with shared HR_PASSWORD env var; no Supabase Auth | **FIX**: switch to Supabase Auth, single admin user, magic-link or email+password |
| 7.2 Public sign in page | Old Google Form is still live, no in-app version | **BUILD**: new `/signin` route, server route writes to `training_records` with `source='signin'`, no auth required |
| 7.3 Imports page | None | **BUILD**: new `/imports` route under HR admin, paste/upload Paylocity + PHS CSVs, preview, commit |
| 7.4 Resolution review page | None (fix sheet exists in xlsx, replaced by `unresolved_people` + `unknown_trainings`) | **BUILD**: new `/review` route, two tabs |
| 7.5 Compliance dashboard | `/compliance` exists, hits `/api/compliance` -> `getComplianceIssues()` | **FIX**: rewrite query against new `employee_compliance` view, add filters (department, position, status), CSV export |
| 7.6 Employee detail page | `/api/employee-detail` exists; no UI route | **BUILD**: new `/employees/[id]` route, full audit trail from `employee_history` view, works for terminated employees too |
| 7.7 Training detail page | None | **BUILD**: new `/trainings/[id]` route, who has it, who's missing, who's expired |
| 7.8 Run log page | `/sync` exists wrapping the `sync_log` hub_settings hack | **FIX**: rewrite to read from `imports` table |

### 3.2 Page-by-page disposition

Existing 16 pages and what happens to them:

| Route | Current purpose | Action | Notes |
|---|---|---|---|
| `/` (dashboard) | Stats + urgent issues | **FIX** | Reads new compliance view, adds 90/60/30/overdue tier counts |
| `/login` | Shared password gate | **FIX** | Real Supabase Auth |
| `/compliance` | Compliance issues | **FIX** | New view, new filters, CSV export |
| `/employees` | Employee list | **FIX** | Shows active by default, terminated togglable, links to detail page |
| `/employees/[id]` | (does not exist) | **BUILD** | Per-employee audit trail |
| `/trainings` | Training list with capacities | **FIX** | Drop the duplicate capacity overrides logic, link to training detail page |
| `/trainings/[id]` | (does not exist) | **BUILD** | Per-training roster with status per employee |
| `/imports` | (does not exist) | **BUILD** | Paste/upload, preview, commit |
| `/review` | (does not exist) | **BUILD** | unresolved_people + unknown_trainings tabs |
| `/signin` | (does not exist) | **BUILD** | Public, no auth, replaces Google Form |
| `/sync` | Sync history | **FIX** | Reads `imports` table |
| `/records` | Training records review | **FIX** | Stays mostly the same, new data layer |
| `/schedule` and `/schedule/print` | Session scheduler | **KEEP** | Out of rework scope; only touched if it breaks against new lib |
| `/attendance` | Attendance + no-shows | **KEEP** | Same |
| `/data-health` | DB quality scan | **KEEP** | Already aware of drift; could be retired later |
| `/notifications` | Compliance alerts | **FIX** | Uses 90/60/30/overdue tier function |
| `/reports` | Analytics dashboards | **KEEP** | Out of rework scope |
| `/archive` | Archived sessions | **DELETE** | Table is being dropped per Section 1.1 |
| `/new-hires` | Recent hire tracker | **KEEP** | Still useful, retargets new lib |
| `/settings` | Dept rules + capacity | **FIX** | Becomes the single source of truth for `required_trainings` and `training_aliases`, replacing the dept_rule and name_map sections of `hub_settings` |

### 3.3 API routes

40 today. About a third are thin wrappers around `lib/training-data.ts` functions and will follow that file when it's split. The rest are sheets-era helpers that should be retired:

**Keep with rewrite:** `/api/compliance`, `/api/employees`, `/api/employee-detail`, `/api/training-records`, `/api/dashboard`, `/api/excusal`, `/api/record-completion`, `/api/dept-rules` (renamed to `/api/required-trainings`), `/api/sync-status`, `/api/sync-log`.

**Build new:** `/api/imports/preview`, `/api/imports/commit`, `/api/imports/[id]`, `/api/review/people`, `/api/review/people/[id]/resolve`, `/api/review/trainings`, `/api/review/trainings/[id]/resolve`, `/api/signin`, `/api/auth/me`.

**Delete:** `/api/refresh` (no-op), `/api/debug` (security risk), `/api/data-health` and `/api/data-health-fix` (dev tools, can come back later), `/api/board-excuse` and `/api/bulk-excuse` (replaced by the new excusal workflow inside the imports page), `/api/exclude` and `/api/excluded-list` (the exclusion list is replaced by `is_active=false`), `/api/no-show-flags` and `/api/no-shows` (move into the new schedule/attendance flow if Kyle still wants it), `/api/name-map` (replaced by `training_aliases` + `employees.aliases`), `/api/capacities` and `/api/capacity` and `/api/thresholds` (consolidate into a single `/api/settings` route).

Net delta: ~15 new routes, ~13 deleted, ~10 rewritten, ~12 untouched.

### 3.4 Components

Per chunk 07, the existing 9 components mostly stay. Specific changes:

- `components/ui/DataState.tsx`: change the default loading message off "Loading data from Google Sheets..." to something honest like "Loading...". Trivial.
- `components/AppShell.tsx`, `Sidebar.tsx`, `MobileNav.tsx`: add nav links for the new `/imports`, `/review`, `/employees/[id]`, `/trainings/[id]` routes.
- `components/AuthGuard.tsx`: switch to Supabase Auth session check.
- `components/EmployeeDetailModal.tsx`: deprecate in favor of full `/employees/[id]` route.
- New: `components/imports/PreviewTable.tsx`, `components/imports/CommitButton.tsx`, `components/review/PersonResolver.tsx`, `components/review/TrainingResolver.tsx`, `components/compliance/StatusCell.tsx`, `components/compliance/FiltersBar.tsx`.

### 3.5 Build order across UI

UI work happens after the data layer is in place (Step 2.4) and the resolver is unit tested (Step 2.5). Within Step 2 the page order is:

1. Imports page (2.6) - this is the workhorse that proves the resolver against real Paylocity + PHS exports
2. Compliance dashboard (2.8) - depends on the compliance view
3. Employee detail page (2.9)
4. Training detail page (2.10)
5. Resolution review (2.11) - needs real `unresolved_people` rows from a real import to be testable
6. Run log (2.12)
7. Public sign-in (2.13) - lightweight, can land any time after the resolver
8. Auth roles (2.14)

---

## 4. Cutover

This is how data moves from the Google Sheets world (the xlsx) and the dirty live DB into the rebuilt model. Cutover happens in stages so we can stop at any point and roll back.

### 4.1 Pre flight (do once before stage 1)

- Snapshot the live DB. `pg_dump` via the Supabase dashboard, store the dump under `docs/snapshots/pre_cutover_<date>.sql.gz`. Not committed to git, kept in the dashboard storage bucket.
- Verify the migration source folder still matches `supabase_migrations.schema_migrations` exactly. (One sanity query, takes seconds.)
- Confirm Kyle has stopped any Apps Script triggers that auto-sync from the xlsx into Supabase. The new ingest path will be the only writer for `employees`, `training_records`, and `excusals` from this point forward.

### 4.2 Stage 1: schema migrations

- Apply migrations 1 through 13 from Section 1.5 in order via the Supabase MCP `apply_migration` tool, one at a time, with Kyle's sign-off between each.
- After every migration, run a single `SELECT count(*) FROM <affected_table>` to confirm row counts didn't move (these are pure structural changes plus seeded `required_trainings` rows).
- Rollback plan for each: every new table is `CREATE TABLE IF NOT EXISTS`; every column add is `ADD COLUMN IF NOT EXISTS`. The drop migration in 1.1 is the only one that's not strictly reversible without the snapshot.

### 4.3 Stage 2: clean up junk excusals

- The live DB has 11,562 `excusals` rows, 11,407 of them with `source='merged_sheet'`. Per chunk 09 these are almost certainly noise: blank cells in the wide Training matrix that the Apps Script interpreted as excusals.
- Step: write a one-shot migration `cleanup_merged_sheet_excusals.sql` that does `DELETE FROM excusals WHERE source = 'merged_sheet'`. Manual sign-off from Kyle required before this runs because it's destructive even though I'm calling it cleanup.
- After delete, expected row count: ~155 (the manual + board_excuse + bulk_excuse rows).
- If Kyle wants to keep them as historical, alternative: `UPDATE excusals SET source='legacy_merged_sheet'` so they don't get touched again but remain visible. I'll default to delete and ask explicitly before running it.

### 4.4 Stage 3: seed `required_trainings`

- Insert the 13 baseline rows from Section 1.2 #6 (1 universal CPR row + 12 dept_rule rows from `hub_settings`) via a one-shot migration.
- Mark the original `hub_settings` `dept_rule` rows as deprecated (don't delete yet; kept for sanity comparison until Stage 6).
- Manual verification: load `/settings` and confirm the dept rules display matches the old list verbatim.

### 4.5 Stage 4: backfill aliases

- Take the 18 `name_map` rows from `hub_settings` (per chunk 11) and write them as a one-shot data migration that updates `employees.aliases` for each matching row.
- For each `name_map` entry, look up the employee by the "new" name (Last, First) and append the "old" name to the aliases array, deduped. If no match found, log to `unresolved_people` with `reason='name_map_no_match'`.
- Take the existing `training_aliases` 25 rows and set their new `source` column to `'manual'` (already covered by the migration in Section 1.2 #7 but verify post-run).

### 4.6 Stage 5: ingest historical data via the new resolver

This is the part that proves the rework works on real data. Run order matters because each source augments what the next can resolve.

1. **Employees tab** (1000 rows, 546 real). Treat as the source of truth for current employees. The xlsx tab has 387 active + 159 terminated = 546 rows. The live DB already has 2225 rows (1838 inactive). Plan:
   - For each xlsx Employees row, look up by `paylocity_id` first. If matched, update name, dept, hire_date, status. If not matched, look up by name+terminated; if matched orphan, reactivate via `reactivate_employee_with_paylocity_id`. If still not matched, INSERT new row.
   - DO NOT touch the existing 1838 inactive rows in the live DB unless they happen to match a name in the xlsx. Their training history stays attached to them per Kyle's rule.

2. **Access tab** (2242 rows, wide matrix). Pivot wide to long. Each non-empty date cell becomes a `training_records` row with `source='access'`. Each non-date cell (NA, FACILITIES, etc.) becomes an `excusals` row with `source='access'`. Match employees by name only (Access has no IDs); rows that don't match go to `unresolved_people`.

3. **Paylocity Import tab** (1415 rows). Match employees by `Employee Id` always. Map `Skill`/`Code` through `training_aliases` (source='paylocity'). Skip non-training rows (Driver's License, MVR, Insurance, Background, Veh Ins Declination). Each row becomes one `training_records` row with `source='paylocity'`. Idempotent because of `training_records_emp_type_date_unique`.

4. **PHS Import tab** (3292 rows). Match employees by `Employee Name` (Last, First) plus aliases. Map `Upload Category | Upload Type` through `training_aliases` (source='phs'). Med Admin No Show / Fail rows do NOT become completions; they become a `notes` field on the resolved employee or get logged to `unresolved_people` with `reason='special_status'`. Each completion row becomes one `training_records` row with `source='phs'`.

5. **Training Records tab** (1001 rows). The legacy QR sign-in form output. Resolve the `Attendee Name` column via the alias system; each row becomes one `training_records` row with `source='signin'`.

After all 5 imports, expected row counts:
- `employees`: probably grows by a small amount (mostly Access rows that are net-new historical names)
- `training_records`: grows from 1655 to somewhere in the 5000-7000 range (1415 + ~3000 PHS valid + 1001 signin + Access matrix conversions, minus dedupes)
- `unresolved_people`: ideally < 200 rows, gives Kyle a real review queue
- `unknown_trainings`: probably 5-15 rows for the Driver's License / Background / etc. categories that were never compliance trainings

### 4.7 Stage 6: switchover

- Stop accepting writes from the Apps Script. The xlsx becomes read-only reference.
- Flip Vercel env vars: `NEXT_PUBLIC_HUB_MODE=live` (or similar flag I introduce in Stage 1) so the new UI takes over.
- Hand the production URL to Kim and Casey. Old Google Form stays live for 1 week as a fallback. After 1 week, retire the Google Form (the Apps Script is left alone per brief rule 12.4).

### 4.8 Stage 7: tear down legacy

After 2 weeks of stable use:
- `DROP TABLE hub_settings` once dept_rule and name_map rows have been verified migrated. The remaining hub_settings row types (capacity, no_show, sync_log) move into proper tables in earlier stages.
- Remove `lib/hub-settings.ts`, `config/trainings.ts`, `config/primary-trainings.ts`.
- Delete dead API routes per Section 3.3.
- Delete the Google Sheets folder and Apps Script .gs files at repo root (out of rework scope but worth flagging in 5).

### 4.9 Rollback boundaries

Hard rollback points (each is a clean stop):

- After Stage 1: revert via snapshot, drop the new tables, no data lost.
- After Stage 2: revert via snapshot if Kyle wants the merged_sheet excusals back.
- After Stage 5: revert via snapshot. The new ingest sources can be re-run without data loss because of the unique key on `(employee_id, training_type_id, completion_date)`.
- After Stage 6: there is no easy rollback once HR is using the new UI. The xlsx is no longer being updated, so going back means re-syncing. Don't cross this line until Stage 5 is verified.

---

## 5. Out of scope

Things in the repo I'm deliberately NOT touching during the rework, so it's clear what stays as-is.

- **The Google Apps Script files at repo root** (`Google Sheets/Config.gs`, `Core.gs`, `SupabaseSync.gs`, `Utilities.gs`). Per brief rule 12.4 the live Apps Script form stays running until the new sign-in page is tested. The .gs files in this repo are reference, not deployed code. Leave them. Only deletion candidate is after Stage 7 cleanup, separate decision.
- **The `Excel and Access Files/` folder** at repo root (`Access Database Module.bas`, `Monthly New Hire Tracker Macro.bas`). Reference for the historical Access database. Read-only.
- **`/schedule`, `/schedule/print`, `/attendance`, `/reports`, `/new-hires` pages**. Working today, not in the target feature list. They get touched only if the lib refactor breaks them and they need a one-line import change.
- **`/data-health` page and `/api/data-health*`**. Already aware of drift, useful diagnostic. Keep.
- **`training_sessions`, `enrollments`, `auto_fill_rules`, `nicknames`** as schema concepts. The session/enrollment scheduling subsystem is separate from compliance ingest and is currently empty. Not deleting the tables (except `nicknames` per Section 1.1), not building any features against them in this rework. If Kyle decides later that the hub should also schedule classes from inside the app, that's a follow-up.
- **The CPR -> First Aid auto fill trigger** (`apply_auto_fill` + `auto_fill_rules`). Stays as-is. The new resolver respects it because it inserts via the same trigger path.
- **The compliance status enum** (`compliance_status`). Same five values stay so no client code breaks. The view's logic changes (30 day window, required_trainings join) but the column type and value set are unchanged.
- **Vercel deployment config** (`vercel.json`, env vars beyond the new ones I'll add). Production deployment stays where it is.
- **Tailwind v4 / lucide-react / xlsx package choices**. No framework swaps. The xlsx package stays even though I'm not adding new uses for it; the existing reports page uses it for exports.
- **The current `/sync` page name**. Even though it's misleading after the cutover (there's no sync, only imports), the route stays at `/sync` with a redirect from any new path to avoid breaking bookmarks. Could rename in a follow-up.
- **Email/SMS notification delivery**. The plan implements the 90/60/30/overdue tier function and surfaces it on the dashboard, but does not wire up actually sending emails. Sending is a separate decision: Resend vs Supabase Edge Function vs nothing. If Kyle wants real notifications, that's a follow up after the dashboard proves the tiering math is right.
- **Multi tenant support**. Single org, single Supabase project, single set of trainings. No tenancy column anywhere.
- **i18n / accessibility audit**. UI is English only and uses the existing component library. WCAG audit is a follow up.
- **Mobile native app**. Web only. The existing mobile nav handles small screens.

---

## End of plan

15 new migrations. ~10 deleted lib files, ~6 new lib subfolders. ~7 new UI routes, ~10 reworked, ~13 deleted API routes. 5 cutover stages with snapshot rollback at each boundary. Sole admin user is Kyle. Compliance gates on CPR universal + 12 dept rules + per-position overrides. Notifications tier at 90 / 60 / 30 / overdue. Terminated employees tracked, hidden from dashboard, visible on detail pages. Rehires reactivate orphaned profiles with their new Paylocity ID.

Estimated build sequence follows the 15 sub-steps in section 10 of the original brief, in order, with sign-off between each. Step 2.1 (write migrations) and Step 2.2 (review and run) are intentionally separated so Kyle reviews the SQL before any DDL hits the live DB.
