# Eight-week rolling operating cadence

This cadence keeps **compliance visibility** ahead of expirations and **training sessions filled** roughly two months out. Supabase remains the source of truth; Excel VBA and merged-sheet imports are inputs only.

## Canonical sources (locked)

| Surface | Role |
|--------|------|
| Hub **`/compliance`** | Required-training status, due windows, exports |
| Hub **`/schedule`** | `training_sessions` + `enrollments`, memos, auto-fill |
| Hub **`/attendance`** | Session check-in (canonical); root `EVC_Attendance_Tracker.xlsx` is legacy/local only unless product adds token sync |
| **`Monthly New Hire Tracker.xlsm`** | Push new hires/transfers → `POST /api/sync/new-hires`; pull training cells → `POST /api/sync/training-status` |
| **`FY Separation Summary (3).xlsx`** | Push terminations → `POST /api/sync/separations`; roster/DOH → `GET /api/sync/roster`; optional hub audit pull → `GET /api/sync/separation-audit` |

See [`workbook-inventory.md`](workbook-inventory.md) and [`sync-contract.md`](sync-contract.md).

## Two-week rule (roster automation)

For **scheduled class dates within the next 14 calendar days** (from today):

- The hub **does not auto-prune** enrollments when the schedule page loads (people stay on the roster unless you change it).
- **Auto-fill** on the schedule page is **disabled** for those sessions — add or remove seats **manually** only.

This keeps imminent classes stable while you send **two-week notices**. Use **`/operations`** → *Two-week notices* and **`/compliance`** → preset **2-week notice (exp)** (`?due_window=14`) for expirations in the next 14 days.

## Weekly rhythm (suggested: Monday)

1. **Compliance triage (15–30 min)**  
   Open **`/compliance`**. Use presets for **2-week notice (exp)**, **Due in 31–60 days**, and **Due in 61–90 days** (or `?due_window=60`) to build the invite list for upcoming classes. Clear **Overdue** first.

2. **Session plan (60-day horizon)**  
   Open **`/operations`** and review **Upcoming session fill (60 days)**. For any session under target fill (for example below 80% at seven days before the session), add or bump sessions on **`/schedule`**.

3. **Enroll and top off**  
   On **`/schedule`**, use auto-fill where configured, then manual enroll. Copy memo/calendar text for intranet or email.

4. **Roster hygiene**  
   Run Excel **push** macros for new hires and separations (or rely on hub imports). Reconcile **`/tracker/new-hires`** and **`/tracker/separations`** audit rows against the workbook. If **`HUB_ROSTER_SYNC_GATED=true`**, approve queued batches on **`/roster-queue`** before they apply.

5. **Imports (as needed)**  
   Merged sheet / Paylocity flows via **`/imports`** — preview, then commit; never skip preview on unfamiliar files.

## Monthly

- Reconcile **`/reports`** separation story with FY workbook and hub employees.  
- Confirm next month’s **New Hire** tab name matches what VBA sends as `sheet` (see sync contract tab-drift section).

## Links

- [`AGENT_HANDOFF_NAV_AND_EXCEL.md`](AGENT_HANDOFF_NAV_AND_EXCEL.md) — nav + Excel inventory handoff  
- [`operations-roster-queue.md`](operations-roster-queue.md) — direct sync vs gated queue (Option B)
