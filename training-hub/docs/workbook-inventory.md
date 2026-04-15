# Workbook inventory (GitHub `main`, monorepo root)

Files tracked at the root of [kylejames0513-bot/evcaccess](https://github.com/kylejames0513-bot/evcaccess) (`git ls-files '*.xlsx' '*.xlsm'`). Use this doc for **tab names** and **header / data row** expectations when aligning VBA, docs, and the hub. Do not commit row-level PII.

**Operator cadence:** see [`operating-cadence-8-weeks.md`](operating-cadence-8-weeks.md) for the suggested weekly/monthly rhythm (compliance → schedule → fill → Excel reconcile).

## 1. `Monthly New Hire Tracker.xlsm`

| Item | Notes |
|------|--------|
| **Hub sync** | `POST /api/sync/new-hires`, `POST /api/sync/training-status` ([`sync-contract.md`](sync-contract.md)) |
| **Hub UI** | In-app audit: [`/tracker/new-hires`](../src/app/tracker/new-hires/page.tsx) |
| **Monthly tabs** | One worksheet per month (e.g. `April 2026`); VBA sends each sheet’s **Worksheet.Name** in JSON as `sheet`. Macros **discover** all non-excluded worksheets (skip `NH Hub Log`, names containing `Sync Log` / `Headcount`, `Dashboard`, `Instructions`, `README`) instead of a fixed English month list—add new month tabs without code changes. |
| **Sections** | **New hires / transfers:** data rows **5–54** (NH), **59–108** (transfer block per reference `HubNewHireSync.bas`). |
| **Header rows** | New-hire header row **4**; transfer section header row **58**. Column positions are resolved by **header text** where possible (fallback columns C–I in reference). |
| **Macro log** | Optional sheet **`NH Hub Log`** — timestamps for push attempts (success/fail). Excluded from data-sheet discovery so it is never scanned as a month tab. |

**VBA reference:** [`../../scripts/new-hire-tracker/HubNewHireSync.bas`](../../scripts/new-hire-tracker/HubNewHireSync.bas) (import steps: [`vba-sync-setup.md`](vba-sync-setup.md))

## 2. `FY Separation Summary (3).xlsx`

| Item | Notes |
|------|--------|
| **Hub sync** | `POST /api/sync/separations`, `GET /api/sync/roster` ([`sync-contract.md`](sync-contract.md)) |
| **Hub UI** | In-app audit: [`/tracker/separations`](../src/app/tracker/separations/page.tsx) |
| **FY tabs** | One sheet per fiscal year, named like `FY 2026 (Jan26-Dec26)`. Default macro (`PushSeparationsToHub`) scans **all FY tabs** each run; optional helper `PushActiveFiscalSheetToHub` targets one resolved FY tab (active sheet, Dashboard pointer, or first FY tab). |
| **Data layout** | Name **column A**, Date of Separation **B**, Date of Hire **C**; data rows **9–413** on each FY sheet (reference constants). |
| **Internal sheets** | **Sync Log**, **Headcount Ledger** (VBA-managed). **`Hub Audit Pull`** — created/refreshed by macro **`PullSeparationAuditFromHub`** (`GET /api/sync/separation-audit`). |

**VBA reference:** [`../../scripts/separation-summary/HubSync.bas`](../../scripts/separation-summary/HubSync.bas) — includes **`PullSeparationAuditFromHub`** (GET `/api/sync/separation-audit`) to refresh worksheet **`Hub Audit Pull`** for reconciliation with FY rows.

**Filename:** HR may use the numbered variant **`FY Separation Summary (3).xlsx`** on disk; VBA and paths should match the file you ship.

## 3. `EVC_Attendance_Tracker.xlsx`

| Item | Notes |
|------|--------|
| **Hub sync** | **None** — not on the `/api/sync/*` allowlist. |
| **Hub UI** | Session attendance lives at [`/attendance`](../src/app/attendance/page.tsx) (Supabase-backed). |
| **Strategy** | **Option A (current):** the hub **`/attendance`** view is **canonical** for operational session check-in; the root **xlsx** is **legacy / optional** for local reporting until product defines otherwise. There is **no** token sync for this file today—do not document one. |

## Dev utility (sheet names only)

From `training-hub/` with a local copy of a workbook (no PII in output—names of sheets only):

```bash
npm run workbook:sheets -- ../evcaccess/EVC_Attendance_Tracker.xlsx
```

See [`scripts/list-workbook-sheets.js`](../scripts/list-workbook-sheets.js).
