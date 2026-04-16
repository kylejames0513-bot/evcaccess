# IMPROVEMENTS_PLAN.md — EVC HR Hub

Enhancement plan for after the audit fixes land. Pairs with:
- `AUDIT_2026-04-16.md` — breakage + stubs (run this first)
- `MIGRATION_PLAN.md` — schema and original build intent
- `REPO_INVENTORY.md` — what exists today

Sequence: **audit Phase 0 → this file's Phase A → B → C → D → E**. Items are ranked by operator-visible leverage, not engineering effort.

---

## Phase A — Foundations (after audit Phase 0)

Cross-cutting changes that every later phase depends on. Do these before feature work so you don't re-touch the same files.

### A1. Central typed config
`process.env` reads are scattered across `src/lib/supabase/public-config.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/cookie-secure.ts`, `src/app/api/ingest/sheets/route.ts`, `src/app/api/public/signin/route.ts`, `src/app/api/vba/route.ts`, `src/proxy.ts`. Consolidate into `src/lib/config.ts` with typed getters: `getSupabaseUrl()`, `getServiceRoleKey()`, `getCronSecret()`, `getSheetsUrls()`, `getResend()`. Fail loudly at boot if a required value is missing.

### A2. Zod schemas at every server-action / API boundary
~40% of server actions take raw `FormData` without validation — `src/app/actions/completion.ts`, `employee.ts`, `separation.ts`, `new-hire.ts`, `training-update.ts`. Add `z.object({...}).parse(...)` at the top of each action. Same for `/api/public/signin`, `/api/vba`, `/api/ingest/*`.

### A3. Shared `Normalizer` for ingestion
Date, status, and name parsing is duplicated across `scripts/ingest/sources/*.ts` and `src/lib/imports/*.ts`. Move all normalizers into `scripts/ingest/normalize.ts` (already exists — extend it) and have every source module + every `src/lib/imports/*.ts` parser call it. Kill the `cell()` helper duplicated in `evc-xlsx.ts` and `paylocity.ts`.

### A4. Idempotency across *every* source
`source_row_hash` is only computed in `attendanceTracker.ts`. Apply it in `employeeMaster.ts`, `newHireTracker.ts`, `separationSummary.ts`, and the future `paylocity.ts`. Add a unique index on `(source, source_row_hash)` in `ingestion_runs` or a join table so re-runs skip cleanly.

### A5. `writeAuditLog` on every mutation
`src/lib/audit-log.ts` is called from some actions but missed in `completion.ts`, `class-enrollment.ts`, the kiosk `POST /api/public/signin`, and the `/api/vba` writes. Wrap mutations in a helper that refuses to commit without an audit row.

### A6. Training-code single source of truth
`src/app/api/public/signin/route.ts` hardcodes a 34-line `SESSION_TO_CODE` map inline. Move to `src/lib/training-codes.ts`; import from kiosk, VBA route, and any future batch-entry UI.

---

## Phase B — Operator-visible features (biggest user leverage)

Ordered by what the HR operator feels first.

### B1. Training detail — inline cadence edit `P0`
`src/app/(dashboard)/trainings/[id]/page.tsx` is read-only. Add an edit form that updates `cadence_months` + `grace_days` via a server action; the `trg_training_cadence_changed` trigger already cascades via `recompute_training_expirations`. Unblocks compliance recalc.

### B2. `/audit-log` viewer `P0`
`audit_log` has writes, no reads. New page at `src/app/(dashboard)/audit-log/page.tsx` with filters: actor, entity_type, date range. Server component + TanStack table. ~2 hrs of work.

### B3. Reports CSV exports `P0`
`/reports` is PDF-only. Add three routes mirroring the existing PDF pattern:
- `/api/reports/compliance-csv` (from `vw_compliance_status`)
- `/api/reports/turnover-fy-csv` (from `vw_turnover_by_fy`)
- `/api/reports/turnover-cy-csv` (from `vw_turnover_by_cy`)
Gate behind the same auth as the PDF route.

### B4. `/new-hires/import` bulk form `P1`
The New Hire Tracker XLSM only loads via the CLI. Mirror the existing `import-panel.tsx` pattern at `src/app/(dashboard)/new-hires/import/page.tsx` that posts to a new `POST /api/ingest/file` action taking `source=new_hire_tracker`.

### B5. `/training/sessions` UI `P1`
`sessions` table exists, no UI. Page with scheduled sessions, attendance, and a "log session completion" action that writes N completions in one transaction. Replaces the dropped `/classes/*` tree.

### B6. `/analytics` dashboard `P1`
Replace the stub with: retention curve (Kaplan-Meier style), turnover by FY/CY, overdue-trainings trend, new-hire funnel. Recharts is already installed. Data comes from the three `vw_*` views.

### B7. `/settings` editor `P1`
Replace read-only page with: source URL editor (MERGED_MASTER_CSV_URL, ATTENDANCE_TRACKER_CSV_URL), cron schedule toggle, notification-template editor, "run audit export" button.

### B8. Keyboard shortcuts `P2`
`command-menu.tsx` exists with `cmdk`. Add: jump-to-employee, log-completion, add-new-hire, log-separation, open ingestion console. Quality-of-life for daily use.

---

## Phase C — Data integrity & integrations

### C1. Finish the ingestion pipeline
- Implement `scripts/ingest/sources/paylocity.ts` (Source E) and register it in the CLI map.
- Wire `/api/ingest/sheets` to actually call `employeeMaster.ingest` + `attendanceTracker.ingest` (currently a stub).
- Schedule `send-notification` via `pg_cron` or a second Vercel cron so email actually leaves the queue.

### C2. Decide dates: date-only vs timestamptz
`completions.completed_on` is `date`, but most timestamps are `timestamptz`. For time-of-day sensitive trainings this loses precision. Pick one and document in `AGENTS.md` — recommend date-only to keep fiscal-year math simple.

### C3. Google Sheets & VBA closed loop
- Deploy `Google Sheets/*.gs.txt` as an Apps Script web app; add `/api/sheets/webhook` that validates a shared secret and upserts to `review_queue`.
- Document the VBA ribbon flow in `vba/README.md`: install → configure URL + service token → round-trip test.
- Decide: read-only or writeback? Document in `AGENTS.md`.

### C4. Compliance view + indexes
- If not already present, create `vw_compliance_status` view joining employees × requirements × completions × exemptions so `/compliance` is one query instead of five.
- Add indexes:
  - `completions(employee_id, training_id, completed_on DESC)`
  - `employees(hire_date, termination_date)`
  - `review_queue(resolved, created_at DESC)` (if not there)

### C5. Pagination
`/employees/page.tsx` and `/trainings/page.tsx` fetch everything. Add `range(0, 50)` + page controls; keeps the app fast at 500+ rows.

---

## Phase D — Security & hardening

### D1. Rate limit auth endpoints
`/api/auth/hr-login` and `/api/public/signin` have no throttle. Add a per-IP limiter (Upstash Redis or a Supabase table-based counter) — 5 attempts / IP / hour on HR login.

### D2. CSRF on public endpoints
Kiosk `POST /api/public/signin` accepts any origin. Add an origin check or a signed token issued when the kiosk page loads.

### D3. Verify and commit the missing RLS migration
`MIGRATION_PLAN.md §1` describes a `20260417000001_rls_policies.sql` migration that isn't in `supabase/migrations/`. Either write it, or confirm the policies are already in the core migration and delete the reference from the plan.

### D4. Service-role key scope audit
`/api/public/signin`, `/api/ingest/sheets`, and the CLI use the full service role. Confirm no exploited path lets an unauthenticated POST escalate to arbitrary SQL. Prefer narrow `security definer` functions that the anon key can call.

### D5. Gate exports
Confirm `/api/exports/*` and `/api/reports/*` require auth. Currently gated by middleware — but middleware isn't mounted (audit item #1). Depends on Phase 0.

---

## Phase E — Quality, ops, and docs

### E1. GitHub Actions CI
No `.github/workflows/`. Add `ci.yml`: `npm ci`, `npm run lint`, `npm run build`, `npm test` on every PR. Stop relying on Vercel's build to catch broken merges.

### E2. Real test suite
- Keep `src/lib/compliance.node-test.ts`; add Vitest.
- One fixture CSV per ingestion source under `tests/fixtures/`, with assertions on row counts, audit writes, and re-run idempotency.
- One Playwright smoke test: login → dashboard renders → ingestion page renders.

### E3. Observability
- `/api/health` → pings Supabase, returns `{ ok, version, ts }`.
- Structured logs on every ingestion run (already writing to `ingestion_runs`, surface it prominently on `/ingestion`).
- Sentry on both Next server and the ingestion CLI (wrap `main()` in `scripts/ingest/index.ts`).

### E4. Seed + preview safety
Vercel previews currently hit prod data. Add `supabase/seed.sql` with ~100 employees, 20 trainings, 200 completions; enable Supabase branching so previews use a branch DB.

### E5. Docs that matter
- Replace `README.md` (Next.js default) with: tech stack, 5-step quick-start, data sources overview, CI/CD, known gaps.
- Expand `AGENTS.md` to 500 words: architecture, env vars, auth flow, CLI ingestion, kiosk URL format, RLS assumptions.
- Add `OPERATOR_RUNBOOK.md`: daily check, "ingestion didn't run" recovery, "someone marked wrong completion" recovery, backup export steps.
- Add `FLOWS.md` documenting "onboard a new hire" and "separate an employee" end-to-end.

### E6. Backup & migration safety
- Nightly `supabase db dump` to object storage (GitHub Actions `cron` + `supabase-cli`).
- Add `-- DESTRUCTIVE MIGRATION` headers to any migration that drops/cascades.
- `scripts/test-migrate.sh`: dump → apply pending → check views/functions → commit.
- Make `db:setup` idempotent so re-running is safe.

### E7. Tooling
- `.github/CODEOWNERS` — ingestion vs UI ownership.
- `.github/PULL_REQUEST_TEMPLATE.md` — checklist: did you add a zod schema? audit log? migration? test?
- `husky` + `lint-staged` for pre-push lint.

---

## Suggested sequencing

| Week | Work |
|------|------|
| 1 | Audit Phase 0 (fix breakage). Then Phase A1–A3. |
| 2 | Phase A4–A6, Phase B1–B3 (training edit, audit log, CSV exports). |
| 3 | Phase B4–B6 (new-hire import, sessions UI, analytics). |
| 4 | Phase C (finish ingestion, views, indexes). |
| 5 | Phase D (security) + Phase E1–E3 (CI, tests, observability). |
| 6 | Phase E4–E7 (seeds, docs, backups, tooling). Polish. |

---

_Generated 2026-04-16. Scope: everything beyond the audit's Phase 0._
