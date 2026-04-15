# Excel ↔ Hub sync contract

All sync routes require header **`x-hub-sync-token`** matching environment variable **`HUB_SYNC_TOKEN`**. Only these paths accept the token (allowlist); they use the Supabase **service role** server-side.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/sync/new-hires` | Monthly New Hire Tracker — push rows (`new_hires[]`) |
| `POST` | `/api/sync/training-status` | Pull training cells for active names |
| `POST` | `/api/sync/separations` | FY Separation Summary — push terminations (`separations[]`) |
| `GET` | `/api/sync/roster` | Active roster; `?include_inactive=true` for hire-date backfill |

VBA modules live in the reference repo:

- `evcaccess-reference/scripts/separation-summary/HubSync.bas`
- `evcaccess-reference/scripts/new-hire-tracker/HubNewHireSync.bas`

Update **`HUB_BASE_URL`** and **`HUB_SYNC_TOKEN`** in each module after deploy.

### Production cutover (VBA)

1. Deploy the hub (e.g. Vercel) and set **`HUB_SYNC_TOKEN`** in project env; never commit it.
2. In each `.bas` module, set **`HUB_BASE_URL`** to the production origin only (no trailing slash on paths; macros append `/api/sync/...`).
3. Set **`HUB_SYNC_TOKEN`** in VBA to the same value as the server env var. Prefer storing the token in a dedicated module or obfuscated constant; rotate by updating Vercel + both workbooks together.
4. Re-import or paste-updated modules into **Monthly New Hire Tracker.xlsm** and **FY Separation Summary.xlsx**, save, and test one row against staging before production.

### Tracker audit rows (hub UI)

When **`sheet`** and **`row_number`** are included on each payload item, successful handling of **`POST /api/sync/new-hires`** and **`POST /api/sync/separations`** also **upserts** a row in **`new_hire_tracker_rows`** (section `new_hire`, unique `sheet` + `row_number` + `section`) or **`separation_tracker_rows`** (unique `fy_sheet` + `row_number`). This gives HR an in-app audit trail that mirrors Excel row anchors. If `sheet` / `row_number` are omitted, employee updates still run but no tracker row is written.

### Access model (operators)

The hub uses **Supabase session auth** for browser users; there is **no separate “read-only manager” role** in the app today—treat access as **trusted HR operators** with full hub permissions. **Excel macros** use **`x-hub-sync-token`** only on the allowlisted `/api/sync/*` routes (service role server-side). Do not widen sync routes or reuse the sync token for browser APIs.

### New hire payload (excerpt)

`{ "new_hires": [ { "last_name", "first_name", "hire_date", "division?", "department?", "position?", "job_title?", "paylocity_id?", "sheet?", "row_number?" } ] }`

### Separation payload (excerpt)

`{ "separations": [ { "last_name", "first_name", "date_of_separation", "sheet?", "row_number?" } ] }`

Full response shapes match the reference implementation under `evcaccess-reference/training-hub/src/app/api/sync/`.
