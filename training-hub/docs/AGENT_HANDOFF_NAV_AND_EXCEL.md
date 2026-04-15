# Agent handoff: navigation polish + Excel workbooks on `main`

Use this file as the **single briefing** for a new agent session. Do **not** rely on prior chat transcripts.

**Status:** Primary goals (Core-first nav, Title Case labels, three workbooks on `/operations`, [`workbook-inventory.md`](workbook-inventory.md), `sync-contract` filename alignment) are implemented in `training-hub`; run the verification checklist after pull.

## Repos and layout

| Path | Role |
|------|------|
| `Documents/evcaccess` | Canonical **Git monorepo**; push `training-hub/` to GitHub `main` per root `README.md`. |
| `Documents/training-hub` | Standalone copy of the app; mirror changes here **or** edit only `evcaccess/training-hub` then copy before push. |
| `Documents/evcaccess-reference` | Read-only reference (backup branch); VBA samples may live here or **inside** `.xlsm` on `main`. |

## Already shipped (context only)

- **One-stop hub:** [`src/app/operations/page.tsx`](../src/app/operations/page.tsx) (`/operations`), hub overview CTA on [`src/app/page.tsx`](../src/app/page.tsx), sidebar/mobile nav groupings.
- **Docs:** [`docs/google-sheet-pipeline.md`](google-sheet-pipeline.md), [`docs/operations-roster-queue.md`](operations-roster-queue.md), [`docs/sync-contract.md`](sync-contract.md) (incl. tab-drift section), Apps Script stub in [`docs/examples/merged-sheet-apps-script.gs`](examples/merged-sheet-apps-script.gs).

## Excel workbooks tracked on GitHub `main` (repo root)

These are in **`evcaccess`** root (`git ls-files '*.xlsx' '*.xlsm'`):

1. **`EVC_Attendance_Tracker.xlsx`** — **Not** connected to `/api/sync/*` like hire/sep. Hub has session attendance at [`/attendance`](../src/app/attendance/page.tsx).
2. **`Monthly New Hire Tracker.xlsm`** — Documented → `POST /api/sync/new-hires`; audit rows in `new_hire_tracker_rows` when `sheet` + `row_number` present.
3. **`FY Separation Summary (3).xlsx`** — Documented → `POST /api/sync/separations`; note **`(3)`** in filename vs older doc strings.

**Inventory task:** Add [`docs/workbook-inventory.md`](workbook-inventory.md) (or extend `sync-contract.md`) with **sheet tab names** and **header row** notes per file. Optional: dev-only script under `training-hub/scripts/` using existing `xlsx` dependency to print `SheetNames` — do not commit row-level PII.

## Primary goals for the next agent

### 1. Navigation: **Core first**, neat labels, works reliably

**Files:** [`src/components/Sidebar.tsx`](../src/components/Sidebar.tsx), [`src/components/MobileNav.tsx`](../src/components/MobileNav.tsx), [`src/app/operations/page.tsx`](../src/app/operations/page.tsx).

- Put **Core** (Hub overview, Compliance, Review queue, Employees) **above** Daily operations / Today.
- Replace harsh **ALL CAPS** section headers with **Title Case** (or softer styling) and use **Title Case** for nav labels (`Hub Overview`, `Review Queue`, `Public Sign-In`, etc.).
- Replace jargon like **“NH workbook audit”** with user-facing text, e.g. **“New Hire Workbook (Excel)”** and **“Separation Workbook (Excel)”** (keep routes `/tracker/new-hires` and `/tracker/separations` unchanged).
- **Verify active state:** ensure `/` only highlights for true home, not every route (`pathname === '/'` vs `startsWith`).

### 2. Hub + docs: tie all **three** workbooks into `/operations`

- Add cards or bullets that **name each file** and link to the right hub area + GitHub path (or “open local copy from repo root”).
- **Attendance xlsx:** document one of: **(A)** hub `/attendance` is canonical, xlsx legacy; **(B)** xlsx primary, hub secondary; **(C)** future token sync — pick with product owner; do not imply sync exists if **A** or **B**.

### 3. Docs / contract alignment

- Align [`docs/sync-contract.md`](sync-contract.md) and VBA notes with the **actual** filename `FY Separation Summary (3).xlsx` if that is what HR ships.
- Cross-link new `workbook-inventory.md` from [`docs/NEXT_SESSION.md`](NEXT_SESSION.md) and [`docs/REFERENCE_CATALOG.md`](REFERENCE_CATALOG.md).

## Security and scope (allowlist-first)

- Do **not** add broad new sync routes without explicit allowlist + token pattern (see [`src/lib/sync-auth.ts`](../src/lib/sync-auth.ts)).
- Do **not** embed secrets in docs or scripts committed to git.

## Verification checklist

- [ ] `npm run lint` and `npm run typecheck` in `training-hub` (or `evcaccess/training-hub` after mirror).
- [ ] Click every sidebar + mobile nav item (logged in): no 404s, correct highlight on home only for `/`.
- [ ] Read `/operations`: all three workbooks mentioned; attendance strategy documented.

## Suggested commit message (when done)

`training-hub: core-first nav, Title Case labels, workbook inventory docs`

---

**Handoff line for the user:** attach `@training-hub/docs/AGENT_HANDOFF_NAV_AND_EXCEL.md` and ask the agent to execute the **Primary goals** section end-to-end.
