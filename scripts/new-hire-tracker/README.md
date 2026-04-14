# Monthly New Hire Tracker — Hub sync macro

This folder contains a VBA module that lets the Monthly New Hire Tracker workbook do both:

1. **Push new hires/transfers to the hub** (which writes to Supabase), and
2. **Pull training status from the hub** (which reads from Supabase).

The module is `HubNewHireSync.bas`.

## Why this is the right flow

- Supabase remains your system of record.
- Workbook macros no longer write directly to PostgREST.
- Hub endpoints (`/api/sync/*`) enforce auth + validation and stay compatible with RLS.

## Endpoints used

- `POST /api/sync/new-hires`
  - Called by `PushNewHiresToHub`
  - Sends rows from monthly tabs (new hires + transfers) with name + hire date.
- `POST /api/sync/training-status`
  - Called by `SyncTrainingFromHub`
  - Sends active names and receives training statuses for CPR/FA, Med Cert, Ukeru, Mealtime.

Both require header: `x-hub-sync-token: <HUB_SYNC_TOKEN>`.

## One-time install (Excel desktop)

1. Open `Monthly New Hire Tracker (1).xlsm`.
2. Press `Alt + F11`.
3. `File -> Import File...`
4. Select `scripts/new-hire-tracker/HubNewHireSync.bas`.
5. Update config constants at the top of the module:
   - `HUB_BASE_URL`
   - `HUB_SYNC_TOKEN`
6. Save workbook.

## Run macros

- `HubNewHireSync.PushNewHiresToHub`
  - Pushes eligible rows into hub/Supabase.
- `HubNewHireSync.SyncTrainingFromHub`
  - Pulls status and updates monthly sheets.

## Assumptions and mappings

The module keeps the same column layout currently used in your existing tracker macro:

- New Hires area: rows `5..54`
- Transfers area: rows `59..108`
- Last/First name in columns `C/D`
- Status in `S` (new hires) and `P` (transfers)
- Training columns:
  - New Hires: CPR/FA `L`, Med Cert `M`, UKERU `N`, Mealtime `O`
  - Transfers: UKERU `K`, Mealtime `L`

If your workbook differs, adjust the `Private Const NH_* / TR_*` values.

## Notes

- This module writes `"Yes"` + comment date for completion, `"N/A"` for excused.
- It skips rows with terminated/quit/resigned/NCNS status.
- It posts all eligible rows each run; hub side handles create/update/reactivate/unchanged safely.
