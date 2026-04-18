# REPO_INVENTORY.md — EVC Training Hub

Generated: 2026-04-16

---

## 1. File Tree

```
evcaccess/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── attendance-log/page.tsx      # Training completion history
│   │   │   ├── classes/
│   │   │   │   ├── page.tsx                 # Class list
│   │   │   │   ├── new/page.tsx             # Schedule class form
│   │   │   │   └── [id]/day/page.tsx        # Day-of attendance roster
│   │   │   ├── compliance/page.tsx          # Compliance matrix
│   │   │   ├── dashboard/page.tsx           # Main dashboard
│   │   │   ├── employees/
│   │   │   │   ├── page.tsx                 # Employee roster table
│   │   │   │   ├── new/page.tsx             # Add employee form
│   │   │   │   └── [id]/page.tsx            # Employee detail + exemptions
│   │   │   ├── imports/page.tsx             # File import (CSV/XLSX)
│   │   │   ├── notifications/page.tsx       # Email queue viewer
│   │   │   ├── reports/page.tsx             # Report links (PDF only)
│   │   │   ├── review/page.tsx              # Unresolved people + unknown trainings
│   │   │   ├── run-log/page.tsx             # Import batch history
│   │   │   ├── settings/
│   │   │   │   ├── page.tsx                 # Org info (read-only)
│   │   │   │   └── account/page.tsx         # Email + sign-out
│   │   │   ├── signin-queue/page.tsx        # Kiosk sign-in resolution
│   │   │   ├── trainings/
│   │   │   │   ├── page.tsx                 # Training catalog
│   │   │   │   ├── new/page.tsx             # Add training type
│   │   │   │   └── [id]/page.tsx            # Training detail (read-only)
│   │   │   └── layout.tsx                   # Auth guard + org check
│   │   ├── actions/
│   │   │   ├── class-enrollment.ts          # Update attendance
│   │   │   ├── class.ts                     # Create class
│   │   │   ├── employee.ts                  # Create employee
│   │   │   ├── evc-xlsx-preview.ts          # XLSX upload -> preview
│   │   │   ├── exemption.ts                 # Create/delete exemptions
│   │   │   ├── import.ts                    # Commit import preview
│   │   │   ├── org.ts                       # Bootstrap organization
│   │   │   ├── signin-session.ts            # Resolve kiosk sign-ins
│   │   │   └── training-type.ts             # Create training type
│   │   ├── api/
│   │   │   ├── auth/hr-login/route.ts       # POST: HR password auth
│   │   │   ├── exports/merged-employees-csv/route.ts  # GET: employee CSV
│   │   │   ├── public/signin/route.ts       # POST: kiosk sign-in (no auth)
│   │   │   ├── qr/route.ts                 # GET: QR code PNG
│   │   │   └── reports/compliance-pdf/route.tsx  # GET: compliance PDF
│   │   ├── auth/callback/route.ts           # OAuth callback
│   │   ├── login/page.tsx                   # HR password login
│   │   ├── onboarding/page.tsx              # Org bootstrap wizard
│   │   ├── signin/[org_slug]/page.tsx       # Public kiosk sign-in
│   │   ├── signup/page.tsx                  # Account creation
│   │   ├── page.tsx                         # Root redirect logic
│   │   ├── layout.tsx                       # Root layout (dark mode)
│   │   ├── providers.tsx                    # QueryClient + themes
│   │   ├── globals.css                      # Tailwind + CSS vars
│   │   └── favicon.ico
│   ├── components/
│   │   ├── training-hub/                    # 15 business components
│   │   │   ├── app-sidebar.tsx              # Sidebar nav
│   │   │   ├── class-day-attendance-table.tsx
│   │   │   ├── command-menu.tsx             # Ctrl+K palette
│   │   │   ├── compliance-matrix.tsx        # Employee x training grid
│   │   │   ├── compliance-mini-chart.tsx    # Dashboard bar chart
│   │   │   ├── dashboard-shell.tsx          # Layout wrapper
│   │   │   ├── employees-table.tsx          # TanStack table
│   │   │   ├── import-panel.tsx             # File drop + preview
│   │   │   ├── kiosk-info-card.tsx          # QR code + URL card
│   │   │   ├── kiosk-sign-in-form.tsx       # Public sign-in form
│   │   │   ├── login-form.tsx
│   │   │   ├── onboarding-wizard.tsx
│   │   │   ├── sign-out-button.tsx
│   │   │   └── signup-form.tsx
│   │   └── ui/                              # 22 shadcn components
│   ├── hooks/use-mobile.ts                  # 768px breakpoint
│   ├── lib/
│   │   ├── audit-log.ts                     # writeAuditLog()
│   │   ├── compliance.ts                    # computeComplianceStatus()
│   │   ├── compliance-matrix.ts             # buildComplianceMatrix()
│   │   ├── compliance.node-test.ts          # Unit test
│   │   ├── database.types.ts                # 17 tables, 9 enums
│   │   ├── report-data.ts                   # PDF report data loader
│   │   ├── utils.ts                         # cn() helper
│   │   ├── auth/general-hr.ts               # HR email constant
│   │   ├── imports/
│   │   │   ├── commit.ts                    # DB write logic
│   │   │   ├── evc-xlsx.ts                  # Merged + Training parser
│   │   │   ├── paylocity.ts                 # CSV parser
│   │   │   ├── phs.ts                       # CSV parser
│   │   │   └── types.ts                     # ImportPreview types
│   │   └── supabase/                        # 5 client helpers
│   ├── pdf/compliance-audit-document.tsx     # React-PDF template
│   └── proxy.ts                             # Session refresh middleware
├── scripts/
│   ├── ensure-general-hr-user.cjs
│   ├── inspect-evc-workbook.mjs
│   └── sync-supabase-url-to-preview-dev.cjs
├── supabase/
│   ├── config.toml
│   ├── seed.sql (empty)
│   ├── functions/send-notification/index.ts
│   └── migrations/ (6 files)
├── docs/EVC_WORKBOOK_MAPPING.md
├── EVC_Attendance_Tracker.xlsx
├── FY Separation Summary.xlsx
├── Monthly New Hire Tracker.xlsm
├── RUN_THIS_SQL.sql
└── Config: package.json, tsconfig.json, next.config.ts,
    tailwind.config.ts, eslint.config.mjs, vercel.json, .env.example
```

---

## 2. Package.json

**Framework:** Next.js 16.2.4, React 19.2.4
**Key runtime deps:** @supabase/ssr 0.10.2, @supabase/supabase-js 2.103.2, @tanstack/react-query 5.99, @tanstack/react-table 8.21, @react-pdf/renderer 4.5.1, date-fns 4.1, xlsx 0.18.5, papaparse 5.5.3, zod 4.3.6, react-hook-form 7.72, recharts 3.8, lucide-react 1.8, sonner 2.0.7, qrcode 1.5.4, cmdk 1.1.1, next-themes 0.4.6, 11 Radix primitives
**Dev deps:** typescript 5, eslint 9, tailwindcss 3.4.17, supabase 2.91.2, tsx 4.19.3

---

## 3. Tooling Config

- **tsconfig.json:** strict, ES2017 target, bundler resolution, `@/*` path alias to `./src/*`
- **next.config.ts:** Maps `SUPABASE_URL`/`SUPABASE_ANON_KEY` (Vercel integration) to `NEXT_PUBLIC_*` at build time
- **tailwind.config.ts:** CSS variable color system, dark mode via class, tailwindcss-animate plugin
- **eslint.config.mjs:** next/core-web-vitals + typescript rules, ignores .next/scripts
- **vercel.json:** framework=nextjs, region=iad1
- **components.json:** shadcn base-nova style, RSC enabled, lucide icons

---

## 4. Database Schema (17 tables, all have RLS)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| organizations | name, slug, regulator, fiscal_year_start_month | Tenant root |
| profiles | id->auth.users, org_id, role | User membership |
| employees | paylocity_id, first/last_name, position, location, department, hire_date, status | Roster |
| training_types | name, category, expiration_months, is_required, archived | Catalog |
| training_requirements | training_type_id, position, department, division | Scoped rules |
| completions | employee_id, training_type_id, completed_on, expires_on(auto), source | Records |
| classes | training_type_id, scheduled_date, location, instructor, capacity, status | Sessions |
| class_enrollments | class_id, employee_id, attended, pass_fail | Attendance |
| signin_sessions | org_id, class_id, raw_name, employee_id, resolved | Kiosk |
| unresolved_people | raw_name, reason, suggested_employee_id, confidence | Reconciliation |
| unknown_trainings | raw_training_name, suggested_training_type_id | Reconciliation |
| name_aliases | employee_id, alias | Name matching |
| exemptions | employee_id, training_type_id, reason, expires_on | Exemptions |
| import_runs | source, status, rows_processed/inserted/updated/unresolved | Batch audit |
| audit_log | actor_id, action, entity_type, entity_id, before/after_data | Change log |
| notification_queue | recipient_email, subject, body, status | Email queue |
| recurring_class_templates | training_type_id, rule_json | Phase 4 stub |

**Functions:** set_updated_at, handle_new_user, bootstrap_organization, current_org_id, current_app_role, set_completion_expires_on
**37 RLS policies** all enforce org isolation via current_org_id()

---

## 5. Flags: Dead Code, Stubs, Half-Built

| Item | Status | Notes |
|------|--------|-------|
| Settings page | **Stub** | Read-only; no edit forms |
| Account settings | **Minimal** | Email + sign-out only |
| Training detail | **Read-only** | No edit, no requirements management |
| Reports page | **Stub** | Only PDF link; no CSV exports |
| recurring_class_templates | **Unused** | Table exists, no UI/API |
| manual_csv import source | **Unused** | Enum exists, no parser |
| notification edge function | **Disconnected** | No cron trigger configured |
| public/ SVGs | **Dead** | Next.js defaults, never used |
| Class lifecycle transitions | **Missing** | No UI to change status |
| Training requirements UI | **Missing** | Table exists, no CRUD page |
| Audit log viewer | **Missing** | Writes only, no display page |
| FY Separation Summary | **Not integrated** | XLSX in repo, no import logic |
| Monthly New Hire Tracker | **Not integrated** | XLSM in repo, no import logic |

---

## 6. Overlap with Brief's New Schema

The brief (Section 3) proposes a different schema. Since the DB is empty, here's the delta:

| Brief Table | Current | Action Needed |
|-------------|---------|---------------|
| employees (expanded) | employees | ALTER: add known_aliases[], phone, supervisor_name_raw, source. Rename first_name->legal_first_name etc. |
| trainings | training_types | New table or ALTER + rename. Adds code, cadence_type, cadence_months, grace_days |
| requirements | training_requirements | Similar, brief uses 'role' instead of 'position' |
| completions (expanded) | completions | ALTER: add status, exempt_reason, source_row_hash, certificate_url, session_id |
| sessions | classes | Rename or parallel table |
| new_hires | **NONE** | Create new |
| new_hire_checklist | **NONE** | Create new |
| separations | **NONE** | Create new with computed tenure, CY/FY |
| offboarding_checklist | **NONE** | Create new |
| employee_events | **NONE** | Create new |
| ingestion_runs | import_runs | Similar, different source values |
| review_queue | unresolved_people + unknown_trainings | Brief consolidates both |
| vw_compliance_status | **NONE** | Create view |
| vw_turnover_by_fy | **NONE** | Create view |
| vw_turnover_by_cy | **NONE** | Create view |
