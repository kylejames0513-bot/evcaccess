# Reference catalog (evcaccess backup branch)

Local clone: `../evcaccess-reference` (branch `backup/main-before-rewrite-20260414`).

## Supabase migrations

44 SQL files copied from `evcaccess-reference/training-hub/supabase/migrations/` (`20260409010504_001_initial_schema.sql` … `20260414000200_compliance_view_expiring_90_days.sql`), plus this repo’s `20260415001000_hub_tracker_tables.sql` (`new_hire_tracker_rows`, `separation_tracker_rows`) and `20260415003000_pending_roster_events.sql` (optional gated Excel sync).

## Excel / VBA contracts

Tab names, header rows, and repo filenames: **[`workbook-inventory.md`](workbook-inventory.md)**.

| Workbook | Module | Endpoints |
|----------|--------|-----------|
| FY Separation Summary (repo: `FY Separation Summary (3).xlsx`) | [`../../scripts/separation-summary/HubSync.bas`](../../scripts/separation-summary/HubSync.bas) | `POST /api/sync/separations`, `GET /api/sync/roster`, `GET /api/sync/roster?include_inactive=true`, `GET /api/sync/separation-audit` (VBA `PullSeparationAuditFromHub`) |
| Monthly New Hire Tracker | [`../../scripts/new-hire-tracker/HubNewHireSync.bas`](../../scripts/new-hire-tracker/HubNewHireSync.bas) | `POST /api/sync/new-hires`, `POST /api/sync/training-status` |

Shared header: `x-hub-sync-token` → env `HUB_SYNC_TOKEN`.

## Scripts (this repo)

- `../../scripts/separation-summary/` — separation workbook module `HubSync.bas`.
- `../../scripts/new-hire-tracker/` — new-hire workbook module `HubNewHireSync.bas`.

## Google Sheets

Folder `evcaccess-reference/Google Sheets/` — inventory Apps Script / sheet IDs when wiring optional Sheets API.

Operational docs in this repo:

- [`docs/operating-cadence-8-weeks.md`](operating-cadence-8-weeks.md) — weekly/monthly HR rhythm (compliance → schedule → fill).
- [`docs/google-sheet-pipeline.md`](google-sheet-pipeline.md) — merged sheet → `/api/imports` flow and column checklist.
- [`docs/examples/merged-sheet-apps-script.gs`](examples/merged-sheet-apps-script.gs) — Apps Script stub.
