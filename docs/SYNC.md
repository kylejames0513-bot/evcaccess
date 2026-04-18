# Sync topology — EVC HR Hub

Single page map of every data pipe between the Google Sheet, the local
Excel workbooks, and the Supabase-backed hub. If something isn't showing
up where you expect, start here.

## Overview

```
               ┌──────────────────────────────────────────────┐
               │   EVC_Attendance_Tracker  (Google Sheet)     │
               │   tabs: Employee · Training · Merged ·       │
               │         Paylocity Import · PHS Import ·      │
               │         Training Records · Attendee Name     │
               │         Fixes                                │
               └──────────┬───────────────────────────────────┘
                          │
           ┌──────────────┼──────────────────────────────────┐
           │              │                                  │
  published CSV (↓)   Apps Script SupabaseSync.gs (↓)    Apps Script
  /api/ingest/sheets  pushMergedToSupabase                HubWriteback.gs
  nightly Vercel cron pushTrainingRecordsToSupabase       doPost (↑)
           │              │                                  ▲
           ▼              ▼                                  │
      ┌──────────────────────────────────────────────────────┴──┐
      │                   Supabase (Postgres)                    │
      │   employees · trainings · completions · sessions ·       │
      │   session_enrollments · new_hires · separations ·        │
      │   review_queue · ingestion_runs · sync_failures ·        │
      │   pending_xlsx_writes · memo_templates                   │
      └──────────┬────────────────────────────────────────────┬──┘
                 │                                            │
           ┌─────┴─────┐                             ┌────────┴────────┐
           │  Hub UI    │                             │ Local CLI       │
           │ (Next.js)  │                             │ scripts/ingest/ │
           │            │                             │ scripts/writeback/
           │ /classes   │                             │                 │
           │ /employees │                             │ npm run ingest  │
           │ /separations                             │ npm run writeback│
           │ /new-hires │                             │   :separations  │
           │ /inbox     │                             │                 │
           └─────┬──────┘                             └────────┬────────┘
                 │                                             │
                 ▼                                             ▼
      ┌────────────────────┐   ┌────────────────────┐   ┌─────────────────────┐
      │ Monthly New Hire   │   │ FY Separation       │   │ EVC_Attendance_     │
      │ Tracker.xlsm       │◀─▶│ Summary.xlsx        │◀──│ Tracker.xlsx        │
      │ VBA ↔ /api/vba     │   │ CLI writeback +     │   │ (local copy; ingest │
      │                    │   │ nightly ingest      │   │  reads from sheet)  │
      └────────────────────┘   └────────────────────┘   └─────────────────────┘
```

## Inbound (into Supabase)

| Source                      | Trigger                        | Code path                                               |
|-----------------------------|--------------------------------|---------------------------------------------------------|
| Merged CSV (employees)      | Nightly cron + manual refresh  | `/api/ingest/sheets` → `scripts/ingest/sources/employeeMaster.ts` |
| Training CSV (completions)  | Nightly cron + manual refresh  | `/api/ingest/sheets` → `scripts/ingest/sources/attendanceTracker.ts` |
| New Hire Tracker `.xlsm`    | Manual CLI / VBA               | `scripts/ingest/sources/newHireTracker.ts` + `/api/vba` |
| FY Separation `.xlsx`       | Manual CLI                     | `scripts/ingest/sources/separationSummary.ts`           |
| Google Sheet bulk push      | Apps Script menu (SupabaseSync.gs) | buildMergedSheet → pushMergedToSupabase             |
| Kiosk sign-ins              | Kiosk POST                     | `/api/public/signin` → Apps Script `doPost`             |

## Outbound (from Supabase)

| Target                             | Trigger                              | Code path                                               |
|------------------------------------|--------------------------------------|---------------------------------------------------------|
| Employee tab (Google Sheet)        | `createEmployeeAction`               | `src/lib/sheet-writeback.ts` → Apps Script `HubWriteback.gs` (`employee_upsert`) |
| Training tab (Google Sheet)        | `finalizeSessionCompletions`         | `src/lib/sheet-writeback.ts` → `HubWriteback.gs` (`completion_upsert`) |
| FY Separation `.xlsx`              | `createSeparationAction` → CLI       | `scripts/writeback/separationSummary.ts` (npm run writeback:separations) |
| New Hire Tracker `.xlsm`           | VBA pull                             | `/api/vba` (the macro polls and writes back)            |

## Failure handling

- **Google Sheet writebacks** that fail land in `sync_failures`. The operator
  sees them on **/ingestion → Outbound writebacks** and **/inbox** with Retry
  / Dismiss buttons.
- **Pending xlsx writes** queue in `pending_xlsx_writes`. The operator runs
  `npm run writeback:separations` locally to apply them. Stale rows (>7 days)
  are highlighted on `/ingestion`.
- **Review queue** (ingestion side) accumulates in `review_queue` when the
  name/training matcher can't resolve a row. Surfaced on `/review` and the
  `/inbox` triage.

## Environment variables

```
# Supabase (picked up by both Next and the ingest/writeback CLIs)
NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)
SUPABASE_SERVICE_ROLE_KEY

# Inbound ingest
MERGED_MASTER_CSV_URL
ATTENDANCE_TRACKER_CSV_URL
CRON_SECRET                    # for /api/ingest/sheets Vercel cron

# Outbound writeback
GOOGLE_APPS_SCRIPT_URL                 # existing kiosk + VBA bridge
GOOGLE_APPS_SCRIPT_WRITEBACK_URL       # preferred for HubWriteback.gs
                                       # falls back to GOOGLE_APPS_SCRIPT_URL

# Notifications (not in use for memos — deferred)
RESEND_API_KEY
NOTIFICATION_FROM_EMAIL
```

## Deploying the Apps Script webhooks

Two files live under `docs/apps-script/`. Both can be in one Apps Script
project (they don't collide):

- `KioskWebhook.gs.txt` — receives kiosk sign-ins. Env: `GOOGLE_APPS_SCRIPT_URL`.
- `HubWriteback.gs.txt` — receives employee_upsert / completion_upsert.
  Env: `GOOGLE_APPS_SCRIPT_WRITEBACK_URL`.

Deploy each as a Web App (Execute as: Me · Who has access: Anyone) and
paste the resulting `/exec` URL into Vercel.

## Common commands

```bash
# Ingest
npm run ingest:seed                    # first-time full load
npm run ingest:refresh                 # pull Google Sheets (A + B)
npm run ingest:dry-run                 # preview without writing
npm run ingest -- --source=separationSummary

# Writeback (local xlsx)
npm run writeback:separations          # apply pending rows to the workbook
npm run writeback:separations:dry      # show what would change

# Smoke tests
npm test                               # node --test suite

# Inspect
npm run inspect:evc-xlsx               # peek at the attendance workbook
```

## Troubleshooting

| Symptom                                       | Check                                                          |
|-----------------------------------------------|----------------------------------------------------------------|
| Hub edit not on the sheet                     | `/inbox` or `/ingestion → Outbound writebacks` for failures    |
| `npm run writeback:separations` won't start   | `workbooks/.FY_Separation_Summary.lock` stale — delete file    |
| Employee tab not getting hub edits            | `GOOGLE_APPS_SCRIPT_WRITEBACK_URL` not set / web app offline   |
| Completion missing from Training matrix       | Check training_code is in `COMPLETION_COLUMN_ALIASES` on the GS |
| Nightly cron not running                      | `vercel.json` cron entry + `CRON_SECRET` env                   |
