# Excel ↔ Hub sync contract

All sync routes require header **`x-hub-sync-token`** matching environment variable **`HUB_SYNC_TOKEN`**. Only these paths accept the token (allowlist); they use the Supabase **service role** server-side.

> **Fail-closed security:** there is no fallback sync token in app code.  
> If `HUB_SYNC_TOKEN` is missing or blank, `/api/sync/*` returns `503` and denies all sync traffic until the environment variable is set.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/sync/new-hires` | Monthly New Hire Tracker — push rows (`new_hires[]`). Returns **202** with `{ queued, pending_id }` when `HUB_ROSTER_SYNC_GATED=true` (no employee writes until `/roster-queue` approval). |
| `POST` | `/api/sync/training-status` | Pull training cells for active names |
| `POST` | `/api/sync/separations` | FY Separation Summary workbook — push terminations (`separations[]`). Same **202** gated behavior as new-hires when `HUB_ROSTER_SYNC_GATED=true`. |
| `GET` | `/api/sync/roster` | Active roster; `?include_inactive=true` for hire-date backfill |
| `GET` | `/api/sync/separation-audit` | Recent `separation_tracker_rows` for Excel reconciliation (`?limit=` default 200). |

### Gated roster (optional)

Set environment variable **`HUB_ROSTER_SYNC_GATED=true`** on the hub to enqueue Excel sync batches in table **`pending_roster_events`**. HR approves or denies from **`/roster-queue`** (browser session). VBA macros receive **HTTP 202** with `pending_id` instead of the usual results payload—see [`operations-roster-queue.md`](operations-roster-queue.md).

Import-ready VBA modules are tracked in this repo:

- [`../../scripts/separation-summary/HubSync.bas`](../../scripts/separation-summary/HubSync.bas)
- [`../../scripts/new-hire-tracker/HubNewHireSync.bas`](../../scripts/new-hire-tracker/HubNewHireSync.bas)

Update **`HUB_BASE_URL`** and **`HUB_SYNC_TOKEN`** in each module after deploy. Full import steps are in [`vba-sync-setup.md`](vba-sync-setup.md).

> Security note: the app no longer supports a fallback sync token. If `HUB_SYNC_TOKEN` is missing in runtime env, `/api/sync/*` returns **503** until configured.

### Production cutover (VBA)

1. Deploy the hub (e.g. Vercel) and set **`HUB_SYNC_TOKEN`** in project env; never commit it.
2. In each `.bas` module, set **`HUB_BASE_URL`** to the production origin only (no trailing slash on paths; macros append `/api/sync/...`).
3. Set **`HUB_SYNC_TOKEN`** in VBA to the same value as the server env var. Prefer loading the token from a private named range / hidden config sheet instead of hardcoding in a distributed macro; rotate by updating Vercel + both workbooks together.
4. Re-import or paste-updated modules into **Monthly New Hire Tracker.xlsm** and the separation workbook HR ships (repo root: **`FY Separation Summary (3).xlsx`** — older docs may say `FY Separation Summary.xlsx`), save, and test one row against staging before production.

Full tab and row layout notes: [`workbook-inventory.md`](workbook-inventory.md).

### Tracker audit rows (hub UI)

When **`sheet`** and **`row_number`** are included on each payload item, successful handling of **`POST /api/sync/new-hires`** and **`POST /api/sync/separations`** also **upserts** a row in **`new_hire_tracker_rows`** (section `new_hire`, unique `sheet` + `row_number` + `section`) or **`separation_tracker_rows`** (unique `fy_sheet` + `row_number`). This gives HR an in-app audit trail that mirrors Excel row anchors. If `sheet` / `row_number` are omitted, employee updates still run but no tracker row is written.

### Access model (operators)

The hub uses **Supabase session auth** for browser users; there is **no separate “read-only manager” role** in the app today—treat access as **trusted HR operators** with full hub permissions. **Excel macros** use **`x-hub-sync-token`** only on the allowlisted `/api/sync/*` routes (service role server-side). Do not widen sync routes or reuse the sync token for browser APIs.

### New hire payload (excerpt)

`{ "new_hires": [ { "last_name", "first_name", "hire_date", "division?", "department?", "position?", "job_title?", "paylocity_id?", "sheet?", "row_number?" } ] }`

### Separation payload (excerpt)

`{ "separations": [ { "last_name", "first_name", "date_of_separation", "sheet?", "row_number?" } ] }`

Full response shapes match the handlers under `src/app/api/sync/`.

### Workbook tab names and layout drift

- **New hire tracker:** The string sent as `sheet` in each `new_hires[]` item should match the **Excel tab name** you are syncing from (e.g. `April 2026`). The hub upserts audit rows on `(sheet, row_number, section)`; changing tab titles without updating VBA will create **duplicate audit keys** or orphan rows. Prefer reading the active sheet name from `ActiveSheet.Name` (or a **config cell** in the workbook) instead of hard-coding a single month.
- **Separation summary:** JSON field `sheet` maps to database column `fy_sheet`. Keep FY tab names **stable**, or have VBA send the current tab’s name on every push so audit rows stay aligned with the workbook.
- **Column drift:** Hub logic keys off the **JSON payload**, not Excel column order. VBA should use header-row lookup (see `HubNewHireSync.bas`) so moving columns does not break pushes as long as the built JSON fields stay correct.
