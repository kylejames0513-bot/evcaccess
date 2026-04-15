# Roster changes: reconcile vs gated approve/deny

## Current behavior (Option A — implemented baseline)

| Channel | What happens | HR control |
|---------|----------------|------------|
| **`/api/imports`** | Preview stored in `imports`; **`commit_import`** applies to `employees` / `training_records` | Explicit **Preview → Commit** in UI |
| **`POST /api/sync/new-hires`** | Creates / updates / reactivates **`employees`** immediately when token is valid | **After-the-fact** review via [`/tracker/new-hires`](../src/app/tracker/new-hires/page.tsx) audit rows (when `sheet` + `row_number` sent) and **Employees** screen |
| **`POST /api/sync/separations`** | Sets **`employees.is_active = false`** and `terminated_at` | Same: **Separation Workbook (Excel)** audit + **Reports** |

This matches a **“trust but verify”** model: Excel stays fast for daily operators; the hub + Supabase remain source of truth; HR reconciles using audit tables and employee detail.

## Option B — gated queue (implemented, opt-in)

When **`HUB_ROSTER_SYNC_GATED=true`** on the server:

1. Table **`pending_roster_events`** stores `kind` (`new_hires_batch` | `separations_batch`), JSON **`payload`**, and **`status`** (`pending` → `processing` → `approved` | `denied` | `failed`).
2. **`POST /api/sync/new-hires`** and **`POST /api/sync/separations`** enqueue one row and return **HTTP 202** with `{ queued, pending_id, row_count }` instead of mutating `employees` immediately.
3. Authenticated HR operators use **`GET /api/roster-queue`**, **`POST /api/roster-queue/:id/approve`**, and **`POST /api/roster-queue/:id/deny`** (shared `hr_session` cookie). Approve replays the stored payload through the same processors as direct sync.
4. UI: **`/roster-queue`** (linked from sidebar under Daily Operations).

Default (**variable unset or false**): Option A — direct sync from Excel as before.

## Where to look in the app

- **Roster queue (gated mode):** [`/roster-queue`](../src/app/roster-queue/page.tsx) — approve/deny pending Excel batches when `HUB_ROSTER_SYNC_GATED=true`.
- **Today / Operations:** [`/operations`](../src/app/operations/page.tsx) — links + recent audit snippets + 60-day session fill summary.
- **Imports review:** [`/imports`](../src/app/imports/page.tsx), [`/review`](../src/app/review/page.tsx).
- **Excel contract:** [`docs/sync-contract.md`](sync-contract.md).
