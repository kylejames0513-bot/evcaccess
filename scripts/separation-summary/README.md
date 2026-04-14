# FY Separation Summary — cleanup + HubSync macro

This folder holds everything used to reshape the workbook and install the macro that pushes separations to the hub.

## Design note (important)

The workbook is full of custom XML, calc chain, shared strings, and
office-specific metadata that **openpyxl drops on round-trip** — even
with zero edits. Loading the file with openpyxl and saving it
immediately destroys 11 files, shrinks `styles.xml`, rewrites
`workbook.xml`, and damages visual formatting.

So all four stage scripts edit the xlsx via **surgical XML surgery**
inside the zip (`xlsx_patcher.py`). Every byte outside the specific
cells we touch stays byte-identical. Verified on a zero-edit
round-trip: 31 files preserved, 0 byte differences.

## The four stages

The scripts are idempotent and can be re-run from the backup:

```sh
cp "FY Separation Summary.backup.xlsx" "FY Separation Summary.xlsx"
python3 scripts/separation-summary/stage1_reference_cleanup.py
python3 scripts/separation-summary/stage2_standardize_fy_sheets.py
python3 scripts/separation-summary/stage3_better_stats.py
python3 scripts/separation-summary/stage4_prepare_hubsync.py   # no-op, just prints install note
```

**Stage 1** — Reference sheet additions.
Writes into previously empty cells only:
- `Reference!B1..B3` — Rehire Eligibility header + Yes/No
- `Reference!C14` — "Resignation without Notice" (new reason)
- `Reference!D1..D14` — Reason Category classification
- `Reference!H1..H3` — Status Meaning decode
- Re-injects x14 data validations on every FY sheet (still `warning` style).

**Stage 2** — FY 2026 subtotal fix + strict validation.
- `FY 2026!B51` literal `10` → `=COUNTA(A37:A47)` (one cell).
- All FY sheet data validations flipped from `warning` to `stop`.
- Does NOT restructure FY 2026's irregular layout — the Data sheet already has matching irregular references, so leaving it alone is fine.

**Stage 3** — Better statistics.
- `Reference!N:O` — new "Active Employees by FY start" table.
- `Data!B2..B6` — rewritten as VLOOKUP into the Reference table.
- `Data!E2..E6` — Avg Monthly Separations now uses months-elapsed (not months-with-data).
- `Data!F2..H6` — Vol/Invol/Other rewritten as SUMPRODUCT filtered by the canonical category from `Reference!D`.
- `Data!A68..G68` — new row for "Resignation without Notice".
- `Data!B56..B68` — category column pulled from Reference via VLOOKUP (single source of truth).
- `Dashboard!A50,C50` — "Rolling 12-month Turnover" (new stat).
- `Dashboard!A51,C51` — "Avg Tenure at Separation" (new stat, returns `N/A` for FY 2023/2024/2025 which pre-date the DOH column being populated).

**Stage 4** — HubSync macro.
Zero workbook changes. The macro manages its own state in two sheets it creates on first run:
- `Sync Log` (per-row outcome history and idempotency)
- `Headcount Ledger` (rolling active-employee snapshots and inferred hire movement)

## One-time macro install (Excel, Windows)

1. Open `FY Separation Summary.xlsx` in Excel.
2. `File → Save As → Excel Macro-Enabled Workbook (.xlsm)`. Keep the same filename, just the new extension. That `.xlsm` is your working copy from now on.
3. Enable the Developer tab if you haven't already: `File → Options → Customize Ribbon → check "Developer"`.
4. `Alt + F11` to open the VBA editor.
5. `File → Import File…` and pick `scripts/separation-summary/HubSync.bas`.
6. (Optional) Add a button to the Dashboard:
    - `Developer → Insert → Button (Form Control)`, draw the button.
    - Assign macro `HubSync.HubSync`.
    - Right-click the button → Edit Text → "Sync to Hub".
7. Save and close.

## Running the sync

Three macros live in `HubSync.bas`:

- **`HubSync.HubSync`** — pushes pending separations through the hub (`POST /api/sync/separations`), which marks employees inactive and sets `terminated_at` in Supabase.
- **`HubSync.PullHireDates`** — pulls `hire_date` through the hub (`GET /api/sync/roster?include_inactive=true`) for any FY-sheet row that has a name but a blank `DOH` cell. Never overwrites an existing DOH value.
- **`HubSync.SnapshotHeadcount`** — appends a manual active-headcount snapshot to `Headcount Ledger` (useful after major new-hire imports).

- **Manually**: click a button on the Dashboard, or `Alt+F8 → HubSync.HubSync → Run` / `HubSync.PullHireDates → Run` / `HubSync.SnapshotHeadcount → Run`.
- **On open (optional)**: in the VBA editor, open `ThisWorkbook`, add a `Workbook_Open()` handler, and call `HubSync.HubSync` from it.

## New workbook-side HR outputs (macro-generated)

The macro now writes richer HR-ready information directly into workbook sheets:

- **`Sync Log` now includes richer columns** (A:P):
  - timestamp, user, FY sheet, row, name, separation date, action, employee id, match type, details
  - **division, department, position, hire date, tenure days, paylocity id**
- **`Headcount Ledger` now tracks ambiguous matches** too (A:L):
  - adds an explicit **Ambiguous** column between No Match and Failed
- **`HR Separation Summary`** (new sheet):
  - sync outcome totals (synced / already inactive / no match / ambiguous / failed)
  - HR metrics (total separated, last 30/90, YTD, avg tenure days, unknown hire-date count)
  - last-12-month separation trend
  - top divisions and departments by separation volume
  - detailed recent records (up to 500 rows) with HR fields and filters

The summary sheet is regenerated each run of:
- `HubSync.HubSync`
- `HubSync.PullHireDates`
- `HubSync.SnapshotHeadcount`

## What the macro does

For every row on the currently selected FY sheet (determined by `Dashboard!B5`):

1. Skips the row if:
    - Column A (Name) is blank or `SUBTOTAL:`.
    - Column B (Date of Separation) is blank or still in the future.
    - The Sync Log already has a `SYNCED` entry for the same `(sheet, row, name, dos)` key — this is how the idempotency works. Nothing is ever pushed twice.
2. Builds a batch payload and sends it to the hub endpoint `/api/sync/separations` (token auth via `x-hub-sync-token`).
3. Hub returns per-row statuses (`synced`, `already_inactive`, `no_match`, `ambiguous`, `failed`).
4. Appends each result into `Sync Log`. Rows with `SYNCED` and `ALREADY_INACTIVE` are considered complete for idempotency and skipped next run.
5. Appends a `Headcount Ledger` snapshot:
   - current active employees (from `/api/sync/roster`)
   - delta vs prior snapshot
   - separations synced this run
   - inferred hire movement since prior snapshot (`delta + separations`)

At the end, a summary message shows `queued / skipped / synced / already inactive / no match / ambiguous / failed`.

## Rolling active count and "new-hire effect"

`Headcount Ledger` gives you a running active count anchored to hub/Supabase, not workbook formulas.  
Each row stores:

- Event timestamp and source event (`SEPARATION_SYNC`, `PULL_HIRE_DATES`, `MANUAL_SNAPSHOT`)
- Active employee count at that moment
- Delta vs prior snapshot
- Separation outcomes from this run
- **Estimated New Hires Since Prior** = `delta + separations synced`

This lets you monitor active headcount movement even though separations and new hires originate from separate workbooks.

## Skipping a specific row (the "Do Not Sync" workflow)

The old plan added a `Do Not Sync` column to every FY sheet. We dropped it to keep Stage 4 zero-risk for the xlsx. If you want to permanently prevent a row from being pushed, add a row to the `Sync Log` sheet manually with the exact sheet name, row number, employee name, separation date, and `Action = SYNCED`. The macro's key-based skip logic will treat it as already synced.

## Troubleshooting

- **"Hub sync failed: HTTP 401/403"** — wrong `HUB_SYNC_TOKEN` in `HubSync.bas` vs Vercel `HUB_SYNC_TOKEN`.
- **"Hub sync failed: HTTP 503"** — server missing `HUB_SYNC_TOKEN` env var.
- **"NO_MATCH" rows in Sync Log** — the name doesn't resolve to any active employee in hub/Supabase; verify spelling and whether they are already inactive.
- **"AMBIGUOUS" rows in Sync Log** — multiple candidates matched; resolve in hub before retrying.
- **Headcount snapshot missing** — `/api/sync/roster` call failed (network/token/config); rerun `HubSync` or `SnapshotHeadcount` after connectivity is restored.
- **No values in new HR columns (Division/Department/Tenure)** — verify `/api/sync/roster?include_inactive=true` is reachable with the same token; those fields are enriched from roster data.
