# Training hub — session notes

## Done (Phase 8 — plan rollout)

- **60-day session fill** — `GET /api/session-fill-summary`, cards on [`/operations`](../src/app/operations/page.tsx), banner on [`/schedule`](../src/app/schedule/page.tsx).
- **Compliance** — `due_window` query param + scheduler presets; URL sync; sticky table header.
- **Gated roster (Option B)** — `pending_roster_events`, [`/roster-queue`](../src/app/roster-queue/page.tsx), approve/deny APIs; opt-in `HUB_ROSTER_SYNC_GATED`.
- **Excel** — `GET /api/sync/separation-audit`; VBA `PullSeparationAuditFromHub`; `HubNewHireSync` discovers month sheets + header-based name columns + `NH Hub Log`.
- **VBA source tracked in-repo** — import-ready modules under `scripts/new-hire-tracker/HubNewHireSync.bas` and `scripts/separation-summary/HubSync.bas` (setup guide: [`vba-sync-setup.md`](vba-sync-setup.md)).
- **Docs** — [`operating-cadence-8-weeks.md`](operating-cadence-8-weeks.md), sync contract + workbook inventory + roster queue updates.

## Done (Phase 7)

- **Compliance** — Tier KPI cards (`due_30` / `due_60` / `due_90` / `overdue`), filters for training type and employee UUID, compact row toggle, scrollable table for small screens, `DataState` loading/error, clearer empty states, CSV via `GET /api/compliance?...&format=csv` (columns match `complianceRowToCsv`, including `job_title`).
- **Trackers** — New hire / separation pages: more columns, sheet filters, inline **PATCH** editing, `job_title` on new hires. **`POST /api/sync/new-hires`** and **`POST /api/sync/separations`** upsert tracker audit rows when `sheet` + `row_number` are sent.
- **Roles** — No in-app HR vs read-only split; documented single-operator + sync-token model in [`sync-contract.md`](sync-contract.md).

## Done (one-stop operations)

- **Today / Operations** — [`src/app/operations/page.tsx`](../src/app/operations/page.tsx) plus sidebar / mobile nav grouping and hub overview CTA ([`src/app/page.tsx`](../src/app/page.tsx)).
- **Merged sheet pipeline** — [`docs/google-sheet-pipeline.md`](google-sheet-pipeline.md) and Apps Script stub [`docs/examples/merged-sheet-apps-script.gs`](examples/merged-sheet-apps-script.gs).
- **Excel tab drift** — Extra section in [`docs/sync-contract.md`](sync-contract.md).
- **Approve/deny strategy** — Option A (reconcile via audit + imports gate) vs Option B (future gated queue) in [`docs/operations-roster-queue.md`](operations-roster-queue.md).

## New agent briefing

- **[`docs/AGENT_HANDOFF_NAV_AND_EXCEL.md`](AGENT_HANDOFF_NAV_AND_EXCEL.md)** — navigation + workbook docs (completed: Core-first nav, Title Case labels, [`workbook-inventory.md`](workbook-inventory.md), attendance strategy **A** on `/operations`).
- **[`docs/operating-cadence-8-weeks.md`](operating-cadence-8-weeks.md)** — weekly/monthly HR rhythm: compliance triage, 60-day session fill, schedule top-off, Excel reconcile, optional gated roster queue.

## Repo context

- **Canonical GitHub:** [kylejames0513-bot/evcaccess](https://github.com/kylejames0513-bot/evcaccess) — app under `training-hub/`.
- **Local dev:** `Documents/training-hub` (standalone); sync to `Documents/evcaccess/training-hub` then push (see monorepo root `README.md`).

## Key files

| Area | Paths |
|------|--------|
| Tracker UI | [`src/app/tracker/new-hires/page.tsx`](../src/app/tracker/new-hires/page.tsx), [`src/app/tracker/separations/page.tsx`](../src/app/tracker/separations/page.tsx) |
| Tracker API | [`src/app/api/tracker-rows/`](../src/app/api/tracker-rows/) |
| Tracker DB + sync upsert | [`src/lib/db/trackers.ts`](../src/lib/db/trackers.ts) |
| Sync handlers | [`src/app/api/sync/new-hires/route.ts`](../src/app/api/sync/new-hires/route.ts), [`src/app/api/sync/separations/route.ts`](../src/app/api/sync/separations/route.ts) |
| Compliance | [`src/app/compliance/page.tsx`](../src/app/compliance/page.tsx), [`src/app/api/compliance/route.ts`](../src/app/api/compliance/route.ts), [`src/lib/db/compliance.ts`](../src/lib/db/compliance.ts) |
| Excel contract | [`docs/sync-contract.md`](sync-contract.md), [`docs/workbook-inventory.md`](workbook-inventory.md) |
| One-stop entry | [`src/app/operations/page.tsx`](../src/app/operations/page.tsx), [`src/components/Sidebar.tsx`](../src/components/Sidebar.tsx) |
| Merged Google Sheet | [`docs/google-sheet-pipeline.md`](google-sheet-pipeline.md) |
| Roster queue strategy | [`docs/operations-roster-queue.md`](operations-roster-queue.md) |

## Constraints

- Hub remains **source of truth**; Excel stays a **projection** / sync target ([`docs/sync-contract.md`](sync-contract.md)).
- Do not commit `.env.local` or secrets.
