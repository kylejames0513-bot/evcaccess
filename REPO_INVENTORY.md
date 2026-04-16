# Training Hub repository inventory

Generated for the greenfield app under `training-hub/`. Remote GitHub URL is not embedded in this workspace: push this folder to your GitHub remote when ready.

## Framework and versions

| Piece | Version |
| --- | --- |
| Next.js (App Router) | 16.2.4 |
| React | 19.2.4 |
| TypeScript | 5.x |
| Tailwind CSS | 3.4.x (PostCSS, no Lightningcss native requirement for local builds) |
| ESLint | 9.x with eslint-config-next 16.2.4 |

## Folder structure (high level)

```
training-hub/
  src/
    app/                 App Router routes (auth, dashboard, public sign in, APIs)
    components/          Shared UI (shadcn under components/ui)
    hooks/
    lib/                 Utilities, Supabase, domain logic, imports, compliance
    types/               Optional generated Supabase types (script driven)
  supabase/
    migrations/          Postgres schema, RLS, triggers
    config.toml          Local Supabase CLI config
  public/
  REPO_INVENTORY.md
```

## package.json dependencies (direct)

Runtime: `@base-ui/react`, `@hookform/resolvers`, `@radix-ui/react-avatar`, `@radix-ui/react-checkbox`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-popover`, `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@react-pdf/renderer`, `@supabase/ssr`, `@supabase/supabase-js`, `@tanstack/react-query`, `@tanstack/react-table`, `class-variance-authority`, `clsx`, `cmdk`, `date-fns`, `html5-qrcode`, `lucide-react`, `next`, `next-themes`, `papaparse`, `qrcode`, `react`, `react-dom`, `react-hook-form`, `recharts`, `shadcn`, `sonner`, `tailwind-merge`, `tw-animate-css`, `zod`.

Dev: `@tailwindcss/postcss`, `@types/node`, `@types/papaparse`, `@types/qrcode`, `@types/react`, `@types/react-dom`, `eslint`, `eslint-config-next`, `tailwindcss`, `typescript`.

## Supabase tables and columns

Source of truth: [`supabase/migrations/20250415120000_initial_training_hub_schema.sql`](supabase/migrations/20250415120000_initial_training_hub_schema.sql).

| Table | Purpose |
| --- | --- |
| `organizations` | Tenant: `name`, `slug` (unique), `regulator`, `fiscal_year_start_month`, branding and field map JSON, timestamps |
| `profiles` | `id` FK `auth.users`, `org_id`, `full_name`, `role` enum, timestamps |
| `employees` | Roster keyed by `(org_id, paylocity_id)`, demographics, `status`, `supervisor_id`, timestamps |
| `training_types` | Catalog per org, `expiration_months`, `archived`, timestamps |
| `training_requirements` | Position scoped requirements, `due_within_days_of_hire`, timestamps |
| `completions` | Unique `(employee_id, training_type_id, completed_on, source)`, `expires_on` via trigger, timestamps |
| `classes` | Scheduled sessions, `status`, timestamps |
| `class_enrollments` | Roster rows, `priority`, attendance fields, unique `(class_id, employee_id)`, timestamps |
| `signin_sessions` | Kiosk rows with `org_id`, optional `class_id` and `employee_id`, timestamps |
| `unresolved_people` | Import or sign in name resolution queue, timestamps |
| `unknown_trainings` | Unknown course name queue, timestamps |
| `name_aliases` | Alternate names per employee, unique `(employee_id, alias)`, timestamps |
| `exemptions` | Requirement exemptions per employee and training, timestamps |
| `import_runs` | Per upload run metrics and status, timestamps |
| `audit_log` | JSON `before_data` / `after_data` (columns named to avoid SQL keyword), timestamps |
| `notification_queue` | Outbound email queue, timestamps |
| `recurring_class_templates` | Recurrence JSON per training type, timestamps |

Enums: `app_role`, `employee_status`, `completion_source`, `class_status`, `enrollment_priority`, `pass_fail`, `import_source`, `import_run_status`, `notification_status`.

Functions: `set_updated_at`, `handle_new_user` (auth trigger), `bootstrap_organization`, `set_completion_expires_on`, `current_org_id`, `current_app_role`.

RLS: enabled on all listed tables. Org scoping via `current_org_id()`. Writes on configuration tables (`training_types`, `training_requirements`, `recurring_class_templates`) restricted to `admin`. Coordinators can write operational data (`employees`, `completions`, `classes`, enrollments, imports, queues, sign in updates where policies allow). Viewers: select only where policies permit.

## Routes (planned or implemented under `src/app`)

| Route | Notes |
| --- | --- |
| `/` | Marketing or redirect to dashboard |
| `/login`, `/signup` | Email password auth |
| `/onboarding` | Org bootstrap wizard calling `bootstrap_organization` |
| `/dashboard` | Metrics shell |
| `/employees`, `/employees/[id]` | Roster and detail |
| `/trainings`, `/trainings/[id]` | Training catalog and detail |
| `/compliance` | Matrix and exports |
| `/imports` | Paylocity and PHS upload preview |
| `/review` | Unresolved people and unknown trainings |
| `/classes`, `/classes/[id]`, `/classes/[id]/day` | Scheduler, roster, class day |
| `/notifications`, `/reports`, `/settings`, `/run-log` | Operations |
| `/signin/[org_slug]` | Public kiosk (no session cookie required for view) |
| `/api/public/signin` | POST inserts `signin_sessions` with service role after validation |
| `/api/qr` | GET returns PNG for class or org sign in URL |

## Components

shadcn generated: `button`, `input`, `label`, `card`, `table`, `badge`, `dialog`, `dropdown-menu`, `select`, `separator`, `tabs`, `tooltip`, `avatar`, `checkbox`, `scroll-area`, `sheet`, `sidebar`, `sonner`, `popover`, `skeleton`, `textarea`, `command`, `input-group`.

App specific (under `src/components`): shell layout, sidebar, top bar, data tables, forms (added during implementation).

## Supabase wiring status

| Area | Status |
| --- | --- |
| Migrations in repo | Authored locally, apply with Supabase CLI or Dashboard SQL |
| Next.js SSR clients | `@supabase/ssr` server, browser, and middleware refresh |
| Edge Function email | Skeleton under `supabase/functions/` calling Resend or Postmark |
| Storage for logos | Not in first migration, add bucket plus policies when branding upload ships |

## Stubbed or deferred relative to full brief

- Live Resend or Postmark keys and production Edge deploy are environment specific.
- Field level Paylocity and PHS column maps finalize after you supply sample CSV files.
- Full recurring calendar UI and drag roster builder need follow up polish beyond first pass screens.
- Integration tests that hit two orgs require `TEST_SUPABASE_URL` and service role in CI secrets.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run gen:types` | Regenerate `src/types/supabase.ts` when linked (`supabase gen types typescript`) |
| `npm test` | Node test runner with `tsx` for unit tests (`src/lib/compliance.node-test.ts`). Add a Supabase-backed integration suite when `TEST_SUPABASE_URL` is available. |
