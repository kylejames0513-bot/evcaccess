# FY Separation Summary — HubSync macro

This folder holds everything used to rebuild the workbook and install the macro that pushes separations to the hub.

## One-time install (Excel, Windows)

1. Open `FY Separation Summary.xlsx` in Excel.
2. `File → Save As → Excel Macro-Enabled Workbook (.xlsm)`. Keep the same name, just the new extension. Overwrite / use the `.xlsm` as your working copy from now on.
3. Enable the Developer tab if you haven't already: `File → Options → Customize Ribbon → check "Developer"`.
4. Open the VBA editor: `Alt + F11`.
5. In the VBA editor, `File → Import File...` and pick `scripts/separation-summary/HubSync.bas`. A new module named `HubSync` will appear under the workbook.
6. (Optional) Add a button to the Dashboard:
    - On the Dashboard sheet, `Developer → Insert → Button (Form Control)`.
    - Draw the button where you want it.
    - In the "Assign Macro" dialog that pops up, pick `HubSync.HubSync`.
    - Right-click the button → Edit Text → label it "Sync to Hub".
7. Save and close.

That's it. Re-opening the `.xlsm` will not re-trigger the setup — the module lives in the workbook now.

## Running the sync

- **Manually**: click the "Sync to Hub" button on the Dashboard, or hit `Alt+F8 → HubSync.HubSync → Run`.
- **On open**: uncomment the `RunHubSync True` line inside `Workbook_Open` in `HubSync.bas`, re-import, and save. The macro will auto-run every time the file opens.

## What it does, exactly

For every row on the currently selected FY sheet (determined by `Dashboard!B5`):

1. **Skips the row** if any of these are true:
    - Column A (Name) is blank or reads `SUBTOTAL:`.
    - Column B (Date of Separation) is blank or still in the future.
    - Column N (Synced To Hub) is already populated — idempotency guard.
    - Column O (Do Not Sync) equals `Yes`.
2. **Looks up the employee** in Supabase via `/rest/v1/employees?select=id,first_name,last_name,is_active&is_active=eq.true`, cached once per run. Match priority:
    1. Exact last + exact first (case-insensitive).
    2. Exact last + first-name starts-with.
    3. Exact last name only if unique in the dataset.
3. **PATCHes** `/rest/v1/employees?id=eq.<id>` with `{ "is_active": false, "terminated_at": "<yyyy-mm-dd>" }`.
4. **Writes `TODAY()`** into column N so the row is never re-pushed.
5. **Appends a line** to the `Sync Log` sheet (timestamp, FY sheet, row, employee, DoS, action, Supabase id, match type, details).

At the end, a summary message shows `synced / skipped / failed`.

## Troubleshooting

- **"Could not fetch employees from Supabase"** — network block, VPN, or expired anon key. The URL/key at the top of `HubSync.bas` matches the Monthly New Hire Tracker macro; if one works and the other doesn't, check your corporate proxy.
- **"NO MATCH"** rows in the log — the name on the Separation sheet doesn't resolve to any active employee. Most common causes: the employee is already marked inactive in Supabase (someone did it manually), or the name is misspelled on the Separation sheet. Fix the source, clear column N, and re-run.
- **"PATCH FAIL" rows** — look at the Details column, it has the HTTP status and response body. 401/403 means auth, 400 means a bad body, 404 means the id disappeared between fetch and PATCH.
- **`Do Not Sync` edge case** — set column O to `Yes` for any row you want the macro to permanently ignore (test data, rehires-then-re-separations, whatever).

## Rebuilding the workbook from scratch

The four stage scripts are idempotent and can be re-run in order from the backup:

```sh
cp "FY Separation Summary.backup.xlsx" "FY Separation Summary.xlsx"
python3 scripts/separation-summary/stage1_reference_cleanup.py
python3 scripts/separation-summary/stage2_standardize_fy_sheets.py
python3 scripts/separation-summary/stage3_better_stats.py
python3 scripts/separation-summary/stage4_prepare_hubsync.py
```

Each stage prints what it changed and validates the file re-opens.
