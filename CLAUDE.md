# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> `AGENTS.md` chains into `README.md`. Read both first — the Next.js 16 caveat
> (AGENTS.md) and the §7 collaboration protocol (README.md) are mandatory, not
> background reading.

---

## Commands

```bash
npm run dev                  # next dev (App Router, Next 16.2)
npm run build                # next build
npm run lint                 # eslint — only lints src/, scripts/ is ignored
npm test                     # node --test against a hand-curated file list

# Run a single test file directly (npm script does not take a filter):
node --import tsx --test src/lib/compliance.node-test.ts

# Ingestion / writeback CLIs (tsx-loaded TypeScript)
npm run ingest:seed                         # full first load of all sources
npm run ingest:refresh                      # nightly Sheets pull (A + B)
npm run ingest:dry-run                      # preview without writing
npm run ingest -- --source=attendance_tracker
npm run writeback:separations[:dry]         # apply queued hub edits to FY xlsx

# Supabase / types
npm run db:setup             # db:push + db:ensure-hr-user
npm run gen:types            # regenerate src/types/supabase.gen.ts from linked project
```

Adding a new test: tests use `node:test` via `tsx`. The `npm test` script
enumerates files explicitly in `package.json` — append the new
`*.node-test.ts` path to that line, otherwise CI will not run it.

Adding a new ingest source: implement under `scripts/ingest/sources/` and
register it in the `SOURCES` map in `scripts/ingest/index.ts`. Source keys are
the `--source=` argument values.

## Architecture

### Next.js 16 middleware lives at `src/proxy.ts`, not `middleware.ts`

Despite the name, `src/proxy.ts` exports `proxy()` plus a `config.matcher` and
is wired by Next 16 as the request middleware. It refreshes the Supabase
session cookie on every request **except** the matcher-excluded paths:
`api/public`, `api/vba`, `api/ingest`, `api/qr`, `api/reports`, `signin`, and
static assets. Those endpoints run their own auth (service role, cron secret,
or none for kiosk). When adding a new public/system endpoint, extend the
matcher exclusion or it will be wrapped in user-session refresh.

### Env var aliasing in `next.config.ts`

Vercel's Supabase integration sets `SUPABASE_URL` / `SUPABASE_ANON_KEY`
without the `NEXT_PUBLIC_` prefix. `next.config.ts` re-publishes them under
the `NEXT_PUBLIC_*` names at build time, preferring the integration vars over
manually-set ones (which can go stale on key rotation). Server-side code
should use the helpers in `src/lib/supabase/public-config.ts` rather than
reading `process.env` directly.

### Three Supabase clients, three contexts

- `src/lib/supabase/browser.ts` — client components.
- `src/lib/supabase/server.ts` (`createSupabaseServerClient`) — RSC, server
  actions, route handlers. Reads/writes the auth cookie.
- `src/lib/supabase/admin.ts` (`createSupabaseServiceRoleClient`) — bypasses
  RLS with `SUPABASE_SERVICE_ROLE_KEY`. Use only in server-side ingest, cron,
  the VBA bridge, and explicit admin writes — never in code reachable from a
  browser request without auth gating.

### Auth gate

`src/app/(dashboard)/layout.tsx` is the single auth + org gate for every
operator page: redirects to `/login` if no user, `/onboarding` if no
`profile.org_id`. Pages under `(dashboard)` can assume both. Pages outside
that group (`/login`, `/signup`, `/onboarding`, `/signin/[org_slug]`,
`/auth/callback`) handle their own access.

### Ingest pipeline shape

`scripts/ingest/index.ts` is the CLI dispatcher. Each source under
`scripts/ingest/sources/` exports an `ingest()` function and shares:

- `normalize.ts` — date / status / name parsing.
- `resolver.ts` — 7-step name-matching ladder (exact → nickname →
  alias → fuzzy via Dice coefficient). Unmatched rows go to `review_queue`.
- `nicknames.ts` — EVC-specific nickname dictionary.
- `idempotency.ts` — row hashing for dedup across re-runs.
- `runLogger.ts` — writes `ingestion_runs` + `audit_log` rows.

Source column headers are matched via flexible `COLUMN_ALIASES` maps inside
each source file — extend those rather than renaming inbound headers.

### Outbound writeback never blocks the hub write

`src/lib/sheet-writeback.ts` POSTs to the Apps Script `HubWriteback.gs` web
app (URL: `GOOGLE_APPS_SCRIPT_WRITEBACK_URL`, falling back to
`GOOGLE_APPS_SCRIPT_URL`). Failures are recorded in `sync_failures` and
surfaced on `/inbox` and `/ingestion → Outbound writebacks`. The Supabase
write that triggered the writeback is committed regardless. Local-xlsx
writebacks queue in `pending_xlsx_writes` and are flushed by
`npm run writeback:separations`. See `docs/SYNC.md` for the full topology.

### Path alias

`@/*` → `./src/*` (tsconfig). Use it consistently; relative `../../..`
imports across `src/` should be rewritten.

### ESLint scope

`eslint.config.mjs` ignores `scripts/**` and `.next/**`. Lint only covers
`src/`. CLI scripts are still type-checked by `tsc` (they're in
`tsconfig.include`).

### Database conventions

Schema lives in `supabase/migrations/`. The `20260417000000_hr_hub_core.sql`
migration is the current baseline; later migrations layer on session
enrollments, memos, and sync infrastructure. A trigger on
`trainings.cadence_months` recomputes `completions.expires_on` across all
rows — be careful with bulk cadence edits. RLS policies enforce single-org
isolation via `current_org_id()`. Regenerate `src/types/supabase.gen.ts`
after every migration with `npm run gen:types`.
