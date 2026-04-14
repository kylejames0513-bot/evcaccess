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
Zero workbook changes. The macro manages its own state in a "Sync Log" sheet that it creates on first run.

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

- **Manually**: click the "Sync to Hub" button on the Dashboard, or `Alt+F8 → HubSync.HubSync → Run`.
- **On open**: uncomment the `RunHubSync True` line inside `Workbook_Open` in `HubSync.bas`, re-import, save.

## What the macro does

For every row on the currently selected FY sheet (determined by `Dashboard!B5`):

1. Skips the row if:
    - Column A (Name) is blank or `SUBTOTAL:`.
    - Column B (Date of Separation) is blank or still in the future.
    - The Sync Log already has a `SYNCED` entry for the same `(sheet, row, name, dos)` key — this is how the idempotency works. Nothing is ever pushed twice.
2. Looks up the employee in Supabase via `/rest/v1/employees?is_active=eq.true`, cached once per run. Match priority: exact last+exact first, exact last + first-name starts-with, exact last if unique.
3. `PATCH`s `/rest/v1/employees?id=eq.<id>` with `{ "is_active": false, "terminated_at": "<yyyy-mm-dd>" }`.
4. Appends a `SYNCED` row to the Sync Log. On the next run, that key is in the idempotency dict and the row is skipped.

At the end, a summary message shows `synced / skipped / failed`.

## Skipping a specific row (the "Do Not Sync" workflow)

The old plan added a `Do Not Sync` column to every FY sheet. We dropped it to keep Stage 4 zero-risk for the xlsx. If you want to permanently prevent a row from being pushed, add a row to the `Sync Log` sheet manually with the exact sheet name, row number, employee name, separation date, and `Action = SYNCED`. The macro's key-based skip logic will treat it as already synced.

## Troubleshooting

- **"Could not fetch employees from Supabase"** — network block, VPN, or expired anon key. The URL/key match the Monthly New Hire Tracker macro; if one works and the other doesn't, check your corporate proxy.
- **"NO MATCH" rows in the log** — the name on the Separation sheet doesn't resolve to any active employee. Most common causes: the employee is already inactive in Supabase (someone marked them manually), or a misspelling on the sheet. Fix, remove the `NO MATCH` log entry, re-run.
- **"PATCH FAIL" rows** — look at the Details column; it has the HTTP status and response body. 401/403 = auth, 400 = bad body, 404 = the id disappeared between fetch and PATCH.
