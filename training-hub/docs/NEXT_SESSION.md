# Training hub — session notes

## Done (Phase 7)

- **Compliance** — Tier KPI cards (`due_30` / `due_60` / `due_90` / `overdue`), filters for training type and employee UUID, compact row toggle, scrollable table for small screens, `DataState` loading/error, clearer empty states, CSV via `GET /api/compliance?...&format=csv` (columns match `complianceRowToCsv`, including `job_title`).
- **Trackers** — New hire / separation pages: more columns, sheet filters, inline **PATCH** editing, `job_title` on new hires. **`POST /api/sync/new-hires`** and **`POST /api/sync/separations`** upsert tracker audit rows when `sheet` + `row_number` are sent.
- **Roles** — No in-app HR vs read-only split; documented single-operator + sync-token model in [`sync-contract.md`](sync-contract.md).

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
| Excel contract | [`docs/sync-contract.md`](sync-contract.md) |

## Constraints

- Hub remains **source of truth**; Excel stays a **projection** / sync target ([`docs/sync-contract.md`](sync-contract.md)).
- Do not commit `.env.local` or secrets.
