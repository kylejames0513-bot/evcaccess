# Roster changes: reconcile vs gated approve/deny

## Current behavior (Option A — implemented baseline)

| Channel | What happens | HR control |
|---------|----------------|------------|
| **`/api/imports`** | Preview stored in `imports`; **`commit_import`** applies to `employees` / `training_records` | Explicit **Preview → Commit** in UI |
| **`POST /api/sync/new-hires`** | Creates / updates / reactivates **`employees`** immediately when token is valid | **After-the-fact** review via [`/tracker/new-hires`](../src/app/tracker/new-hires/page.tsx) audit rows (when `sheet` + `row_number` sent) and **Employees** screen |
| **`POST /api/sync/separations`** | Sets **`employees.is_active = false`** and `terminated_at` | Same: **Sep workbook audit** + **Reports** |

This matches a **“trust but verify”** model: Excel stays fast for daily operators; the hub + Supabase remain source of truth; HR reconciles using audit tables and employee detail.

## Option B — gated queue (future, if required)

If policy requires **no employee mutation** until a second person approves:

1. Add a table such as `pending_roster_events` (`kind`, `payload`, `status`, `created_by`, …).
2. Refactor sync handlers to **insert pending** rows instead of writing `employees` directly.
3. Add hub routes **`POST /api/roster-events/:id/approve`** and **`…/deny`** (auth: HR only) that run today’s sync logic inside a transaction.
4. Surface a **Queue** page under Operations.

Estimate: migration + API + UI + tests; only undertake if Option A is insufficient.

## Where to look in the app

- **Today / Operations:** [`/operations`](../src/app/operations/page.tsx) — links + recent audit snippets.
- **Imports review:** [`/imports`](../src/app/imports/page.tsx), [`/review`](../src/app/review/page.tsx).
- **Excel contract:** [`docs/sync-contract.md`](sync-contract.md).
