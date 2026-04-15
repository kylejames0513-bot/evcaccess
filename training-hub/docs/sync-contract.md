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

### New hire payload (excerpt)

`{ "new_hires": [ { "last_name", "first_name", "hire_date", "division?", "department?", "position?", "job_title?", "paylocity_id?", "sheet?", "row_number?" } ] }`

### Separation payload (excerpt)

`{ "separations": [ { "last_name", "first_name", "date_of_separation", "sheet?", "row_number?" } ] }`

Full response shapes match the reference implementation under `evcaccess-reference/training-hub/src/app/api/sync/`.
