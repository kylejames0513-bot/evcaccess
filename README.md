# EVC HR Hub

Single-operator HR management app for **Emory Valley Center**. Handles training
compliance, new-hire onboarding, separations, and ingestion from five data
sources. Built on Next.js 16 + Supabase + Vercel. Shared HR password login.

> **Reading order for Claude (or any new contributor):**
> 1. This file (project overview + collaboration protocol)
> 2. `AGENTS.md` (Next 16 caveat)
> 3. `docs/MIGRATION_PLAN.md` + `docs/REPO_INVENTORY.md` (history and file tree)
> 4. `docs/EVC_WORKBOOK_MAPPING.md` (external workbook schemas)
>
> Historical references to `AUDIT_2026-04-16.md` and `IMPROVEMENTS_PLAN.md`
> point to files that existed on earlier branches but are not in the current
> tree. Recover from git history if needed: `git log --all --oneline --
> AUDIT_2026-04-16.md`.

---

## 1. What this app does

- **Compliance matrix** — every employee × every training requirement, with
  status (compliant / due-soon / overdue / exempt) based on per-training
  cadence.
- **Training catalog** — 20 preseeded trainings (CPR_FA, UKERU, MEALTIME,
  MED_TRAIN, etc.). Operator can edit cadences; a DB trigger recomputes
  expirations across all completions.
- **New-hire pipeline** — 10-stage kanban, per-hire checklist.
- **Separations** — computed tenure, fiscal-year bucketing, offboarding
  checklist.
- **Ingestion** — five data sources pulled via CLI (`npm run ingest:*`) and a
  nightly Vercel cron.
- **Kiosk sign-in** — public QR endpoint for in-person training sessions.
- **Notifications** — queued emails via a Supabase edge function (Resend).

## 2. Data sources

| ID | Source                              | Format                | Implementation |
|----|-------------------------------------|-----------------------|----------------|
| A  | Merged Employee Master              | Google Sheet CSV      | `scripts/ingest/sources/employeeMaster.ts` |
| B  | Attendance Tracker (completions)    | Google Sheet CSV      | `scripts/ingest/sources/attendanceTracker.ts` |
| C  | Monthly New Hire Tracker            | `.xlsm`               | `scripts/ingest/sources/newHireTracker.ts` |
| D  | FY Separation Summary               | `.xlsx`               | `scripts/ingest/sources/separationSummary.ts` |
| E  | Paylocity exports                   | CSV                   | **Not implemented** — see audit item #4 |

## 3. Tech stack

- **Next.js 16.2** (App Router; see `AGENTS.md` — this is NOT the Next.js in
  most training data)
- **React 19.2**
- **Supabase** — Postgres + Auth + Edge Functions + `pg_cron`
- **Tailwind 3.4** + **shadcn** + 11 Radix primitives
- **TanStack Query + Table**, **react-hook-form**, **zod**, **date-fns**
- **Recharts**, **@react-pdf/renderer**, **xlsx**, **papaparse**
- **Vercel** hosting + cron + integration-managed Supabase env

## 4. Quick start

```bash
npm install
npm run vercel:link           # link repo to Vercel project
npm run vercel:env:pull       # pulls .env.local from Vercel
npm run supabase:link         # link Supabase CLI
npm run db:setup              # db:push + db:ensure-hr-user
npm run gen:types             # regenerate TS types
npm run dev                   # http://localhost:3000
```

First-time seed of all five sources:
```bash
npm run ingest:seed
```

## 5. Current status (high level)

- **~70% wired.** Ingestion A–D works via CLI. UI covers roster, trainings,
  new hires, separations, compliance matrix, ingestion console, review queue.
- **Known breakage** — historical audit (`AUDIT_2026-04-16.md`) is no longer
  in the tree. Top items from it: middleware not mounted, `/api/ingest/sheets`
  cron is a no-op, VBA endpoint selects a non-existent column, dead routes on
  dropped tables, missing RLS migration.
- **Roadmap** — historical (`IMPROVEMENTS_PLAN.md`, no longer in the tree):
  five phases (A–E), 6-week sequencing: foundations → features → data
  integrity → security → quality.

## 6. Branching protocol

- Feature work lives on branches named `claude/<topic>-<hash>` or a similar
  descriptive name.
- Never force-push to `main`.
- Always open a PR (draft is fine).
- Docs-only PRs may merge without review; code PRs get reviewed.

---

## 7. Working with Claude — collaboration protocol

This section exists so any Claude session that reads this repo picks up the
user's stated preferences without having to re-learn them.

### 7.1 Always explain terms in plain English

When Claude asks a question about code, config, or architecture, the response
must follow this format:

> **Q: [the question]**
>
> *What this means:* [1–2 sentences in non-jargon explaining the concept]
>
> [tradeoffs, with a soft recommendation if one exists]

Example:

> **Q: Should the app crash at boot if `SUPABASE_SERVICE_ROLE_KEY` is missing,
> or just log a warning?**
>
> *What this means:* "Crash at boot" = the server refuses to start; you see
> the error immediately. "Warn and continue" = the app starts, but features
> that need the key fail later with a confusing error.
>
> Most teams crash in prod, warn in dev. Recommend crash everywhere.

### 7.2 For small items — one question per turn

A single config decision, a single field name, a single column choice — ask
one question, wait for the answer, move on. Do not dump ten questions.

### 7.3 For big items — a numbered discovery list first

Before writing code for any of these:
- **UI overhaul** (any scope beyond one page)
- **New database / schema** (e.g., "a new training database")
- **New pipeline** (e.g., a sixth data source)
- **Anything touching multiple pages or multiple tables**

Claude asks a numbered list of discovery questions covering:
- **Scope** — how much is in / out?
- **Design source** — mockup, reference site, or from scratch?
- **Keep vs. scrap** — replace existing, or parallel system?
- **Connections** — which tables, pages, sources hook into this?
- **Historical data** — migrate existing records, or start fresh?
- **Who edits / who sees** — drives RLS and UI gating.

The user answers what they know, says "figure it out" on the rest, and Claude
proposes defaults for those. No code until the list is answered.

### 7.4 Never guess on

- External IDs (Paylocity IDs, employee IDs from source sheets)
- Column names from third-party files (always inspect the file or ask)
- Business rules (fiscal-year start, grace days, exemption policy, training
  cadences)
- Auth policy (who can edit what)
- Destructive operations (drops, cascades, force-pushes, secret rotation)

### 7.5 Task shorthand

The user can reference roadmap items directly; Claude is expected to know what
they mean without re-explanation:

- `"do phase A1"` → execute IMPROVEMENTS_PLAN.md §A1 (central typed config).
- `"audit item 3"` → execute AUDIT_2026-04-16.md §3 (drop `column_key` or
  migrate it).
- `"start the UI overhaul"` → launch the §7.3 discovery questions.
- `"new training database"` → launch the §7.3 discovery questions.
- `"top 8"` → the punch list in `AUDIT_2026-04-16.md §3`.

### 7.6 When Claude is told "figure it out"

1. Pick a sane default.
2. State the default in one sentence.
3. Explain why in ≤2 sentences, plain English.
4. Name the one thing that would change that default.
5. Proceed.

No endless prompting. No perfect-is-the-enemy-of-good.

### 7.7 Before writing code, Claude must confirm

For code changes, Claude states in one line:
- **What files will change**
- **What the user will see after**
- **Anything risky** (destructive, long-running, deploy-affecting)

Then waits for a go-ahead unless the user has already said "proceed".

### 7.8 After writing code

- Commit with a descriptive message (imperative mood, why > what).
- Push to the feature branch.
- Open or update a draft PR.
- One-to-two-sentence summary to the user. What changed, what's next.

---

## 8. Env vars

Required:
- `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `SUPABASE_ANON_KEY` /
  `SUPABASE_PUBLISHABLE_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, for ingestion + admin writes
- `CRON_SECRET` — Vercel cron auth

Ingestion:
- `MERGED_MASTER_CSV_URL` — Google Sheet published CSV (Source A)
- `ATTENDANCE_TRACKER_CSV_URL` — Google Sheet published CSV (Source B)

Notifications:
- `RESEND_API_KEY`
- `NOTIFICATION_FROM_EMAIL`

Optional:
- `GENERAL_HR_AUTH_EMAIL`, `GENERAL_HR_PASSWORD` — shared HR login
- `GOOGLE_APPS_SCRIPT_URL` — dual-write target (currently unused)
- `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY` — integration test fixtures

Full list with comments: `.env.example`.

## 9. Common commands

```bash
# Dev
npm run dev
npm run lint
npm test

# Ingestion
npm run ingest:seed                         # first-time full load
npm run ingest:refresh                      # pull Google Sheets A+B
npm run ingest -- --source=attendance_tracker
npm run ingest:dry-run                      # preview without writing

# DB
npm run db:push                             # apply pending migrations
npm run db:ensure-hr-user                   # create shared HR auth user
npm run gen:types                           # regenerate TS types
npm run db:setup                            # push + ensure user

# Utilities
npm run inspect:evc-xlsx                    # peek at the workbook
```

## 10. Important files

| Path | Purpose |
|------|---------|
| `src/app/(dashboard)/**` | Operator-facing pages |
| `src/app/api/**` | HTTP endpoints (ingest cron, exports, kiosk, VBA bridge) |
| `src/app/actions/**` | Next.js server actions (form submissions) |
| `src/lib/imports/**` | Client-side parsers for file uploads |
| `scripts/ingest/**` | Server-side CLI ingestion of all five sources |
| `supabase/migrations/**` | Canonical schema. `20260417000000_hr_hub_core.sql` is the source of truth. |
| `supabase/functions/send-notification/` | Email dispatcher (needs cron) |
| `vba/`, `docs/apps-script/`, `excel-macros/` | External workbook integrations (VBA modules, Apps Script `.gs` sources, and raw macro exports) |
| `workbooks/` | Reference copies of the source Excel/Sheets workbooks (`EVC_Attendance_Tracker.xlsx`, `FY Separation Summary.xlsx`, `Monthly New Hire Tracker.xlsm`) |
| `docs/` | Written docs: migration/inventory history, workbook column mappings, Apps Script deployment guide |

---

_Last updated 2026-04-18. This README is the entry point for any AI agent or
new engineer. Keep it current when the protocol or phase ordering changes._
