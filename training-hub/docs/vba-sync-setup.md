# VBA sync setup (new hire + separation workbooks)

Use these modules when the workbook does **not** already contain hub sync macros.

## Module files in this repo

- New hires workbook macro: [`../../scripts/new-hire-tracker/HubNewHireSync.bas`](../../scripts/new-hire-tracker/HubNewHireSync.bas)
- Separation workbook macro: [`../../scripts/separation-summary/HubSync.bas`](../../scripts/separation-summary/HubSync.bas)

## One-time import steps (Excel)

1. Open the workbook (`Monthly New Hire Tracker.xlsm` or `FY Separation Summary (3).xlsx`).
2. Press `Alt + F11` to open the VBA editor.
3. In **Project Explorer**, right-click the workbook -> **Import File...**.
4. Import the matching `.bas` module from `scripts/`.
5. Edit the module constants:
   - `HUB_BASE_URL` = deployed hub origin (for example `https://your-hub.vercel.app`)
   - `HUB_SYNC_TOKEN` = same value as server env `HUB_SYNC_TOKEN`
6. Save workbook.

## Run macros

- New hires: run `PushNewHiresToHub`
- Separations: run `PushSeparationsToHub`
- Optional separation audit pull: `PullSeparationAuditFromHub`

Both push macros support:

- `HTTP 200` -> applied immediately
- `HTTP 202` -> queued for manual approval on `/roster-queue` when `HUB_ROSTER_SYNC_GATED=true`

## Workbook behavior included in these modules

- **New hire tracker**: discovers all month sheets dynamically and excludes operational tabs (`NH Hub Log`, `Sync Log`, `Headcount`, `Dashboard`, `Instructions`, `README`).
- **Separation tracker**: picks the FY sheet from active tab, `Dashboard!B5`, or first tab beginning with `FY`.
- Writes sheet/row anchors in payload so hub tracker audit rows stay aligned with Excel rows.
