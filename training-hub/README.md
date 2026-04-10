# EVC Training Hub

Training compliance hub for Emory Valley Center. Built on Next.js 16, Supabase Postgres 17, Tailwind v4. Replaces the legacy Google Sheets + Apps Script workflow with a typed end-to-end pipeline that can ingest from Paylocity, PHS, the historical Access database, and an in-app sign-in form.

## Layout

```
training-hub/
  src/
    app/                  Next.js App Router routes (16 pages, ~30 API routes)
    components/           Sidebar, MobileNav, AppShell, AuthGuard, ui/*
    lib/
      db/                 Server-only data access layer (one module per concern)
      resolver/           Per-source parsers + name/training/date matching + fuzzy
      notifications/      Tier classification (90 / 60 / 30 / overdue)
      supabase.ts         Lazy-constructed Supabase clients
    types/
      database.generated.ts   Auto-generated from live schema
      database.ts             App-level type aliases over the generated file
  supabase/migrations/    All schema changes, exact replay of live DB
  public/
scripts/cutover/          One-shot historical bulk-load scripts and SQL
docs/                     Inventory, plan, drift docs
```

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` (Settings → API)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Settings → API)
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings → API, secret)
2. `npm install`
3. `npm run dev` and open <http://localhost:3000>.

## Auth

Single HR admin user for now. Create in the Supabase dashboard:

1. Authentication → Users → Add user → "Create new user"
2. Email + a strong password
3. Optionally set `user_metadata.role = 'hr_admin'`

The `/login` page uses `signInWithPassword` and the existing `AuthGuard` wrapper redirects unauthenticated users back to `/login`.

The legacy shared `HR_PASSWORD` env var is still accepted as a fallback during transition; remove it from Vercel once the Supabase Auth user works.

## Imports workflow

Replaces every "go run the Apps Script sync" instruction.

1. Visit `/imports`.
2. Pick a source (Paylocity, PHS, Access, or sign in) and upload the CSV or XLSX. The browser parses it via the existing `xlsx` package.
3. Click **Preview**. The resolver runs server-side via `/api/imports`:
   - Resolves each row's person via paylocity_id → name → aliases → fuzzy match (conservative thresholds, see `src/lib/resolver/fuzzy.ts`).
   - Resolves each row's training via the alias dictionary, with per-source preprocessing.
   - Skips known non-training rows (Drivers License, MVR, etc.).
   - Drops anything that does not match into the review queue.
   - Persists a preview row in `imports` with the JSONB payload.
4. Review the summary `{rows_in, added, skipped, unresolved, unknown, rehired}`.
5. Click **Commit**. The `commit_import` RPC writes everything in one transaction and flips the import to `committed`.
6. Visit `/review` and resolve any open `unresolved_people` or `unknown_trainings` rows. Resolving an unknown training also creates a `training_aliases` row so future imports pick it up automatically.

## Compliance dashboard

`/compliance` reads from the `employee_compliance` view which:

- Joins `required_trainings` with position > department > universal precedence.
- Uses a 30-day expiring_soon window.
- Exposes `due_in_30`, `due_in_60`, `due_in_90`, `days_overdue` columns.
- Filters out terminated employees by design (use `/employees/[id]` for the audit trail of terminated people).

The page filters by department, position, status, and exports the visible rows to CSV via a client-side blob.

## Pages

| Route | Purpose |
|---|---|
| `/` | Stats + urgent issues |
| `/compliance` | Filterable compliance dashboard with CSV export |
| `/employees` | Employee list with rolled-up status |
| `/employees/[id]` | Per-employee audit trail (active and terminated) |
| `/trainings/[id]` | Per-training roster grouped by status |
| `/imports` | Upload, preview, commit |
| `/review` | Unresolved people + unknown trainings queue |
| `/signin` | Public sign-in form (no auth) |
| `/sync` | Run log of import history |
| `/settings` | Required trainings, capacities, dept rules |
| `/schedule`, `/attendance`, `/records`, `/notifications`, `/reports`, `/new-hires` | Existing pages, mostly untouched by the rework |

## Data model highlights

- `employees.paylocity_id` is the canonical join key. Names are display only.
- Rehires reactivate the orphaned former-employee profile via the `reactivate_employee_with_paylocity_id` RPC, preserving their training history.
- `required_trainings` supports universal, department, and (department, position) rules with a CHECK constraint enforcing the shape.
- `training_aliases.source` tags where each alias was learned (paylocity / phs / access / signin / manual).
- `master_completions` view picks the winning completion per (employee, training) using newest date first, with explicit source preference (paylocity > phs > access > signin > manual > auto_fill) as the tiebreak.
- `employee_history` view is the unfiltered audit trail used by the employee detail page.

## Migrations

Source folder under `supabase/migrations/` exactly mirrors `supabase_migrations.schema_migrations` on the live DB. Filenames use `<UTC-yyyymmddHHMMSS>_<name>.sql`. To apply on a fresh database, run them in numeric order (Supabase CLI: `supabase db push`).

When you change the schema:

1. Add a new migration file (the Supabase MCP `apply_migration` tool will generate the version).
2. Regenerate types: Supabase MCP `generate_typescript_types` → `src/types/database.generated.ts`.
3. Add app-level aliases in `src/types/database.ts` only if the new tables need friendlier names.

## Tests

`npm test` runs vitest. Coverage focuses on the pure resolver modules and the notification tier function:

- `src/lib/resolver/date-parse.test.ts` (10 tests)
- `src/lib/resolver/name-match.test.ts` (20 tests, including alias generation)
- `src/lib/resolver/training-match.test.ts` (10 tests for paylocity/phs preprocessors)
- `src/lib/resolver/fuzzy.test.ts` (14 tests for Levenshtein, similarity, scoring, classification)
- `src/lib/notifications/tiers.test.ts` (12 tests covering every tier boundary)

66 tests total. The async `resolveEmployee` and `matchTraining` paths require a live database and are not yet covered; they're exercised by integration tests via the imports flow against a test project.

## Cutover

The historical bulk-load is one-shot and lives outside `supabase/migrations/`. See `scripts/cutover/README.md` for the step-by-step instructions and verification queries. The forward schema migrations under `supabase/migrations/` are safe to replay on a fresh database; the cutover scripts are not.

## Deployment

Vercel. The repo's `vercel.json` is unchanged. Push to `main` and Vercel auto-deploys. Required env vars are listed in `.env.local.example`; set them in the Vercel dashboard.
