# MIGRATION_PLAN.md — EVC HR Hub Rebuild

## Decision: Clean Rebuild

The DB is empty. Rather than ALTER 17 tables to match the brief's schema, we'll write one comprehensive migration that creates the brief's schema from scratch, keeping existing tables that are compatible and adding new ones. The multi-tenant `org_id` pattern is dropped per the brief (single operator, phase 1).

---

## 1. New Migrations to Author

### Migration A: `20260417000000_hr_hub_core.sql`
The master migration from Section 3 of the brief. Creates:

**Tables (14 new/replaced):**
- `employees` — expanded roster (known_aliases[], phone, supervisor_name_raw, source)
- `trainings` — replaces training_types (adds code, cadence_type, cadence_months, grace_days)
- `requirements` — replaces training_requirements (role, department scoping)
- `completions` — expanded (status, exempt_reason, source_row_hash, certificate_url, session_id)
- `sessions` — replaces classes (simplified)
- `new_hires` — 10-stage pipeline tracking
- `new_hire_checklist` — per-hire onboarding tasks
- `separations` — departure records with computed tenure, CY, FY
- `offboarding_checklist` — per-separation tasks
- `employee_events` — transfers, role changes, leave
- `ingestion_runs` — replaces import_runs
- `review_queue` — consolidates unresolved_people + unknown_trainings
- `name_aliases` — split into alias_last + alias_first
- `audit_log` — text actor, jsonb before/after, source field

**Pre-seeded data:**
- 20 training types from Section 3 (CPR_FA, UKERU, MEALTIME, MED_TRAIN, etc.)

**Functions:**
- `recompute_training_expirations(training_id)` — cascade cadence changes
- `trg_training_cadence_changed()` — trigger on trainings.cadence_months update

**Views:**
- `vw_compliance_status` — current status per employee per training
- `vw_turnover_by_fy` — separations by EVC fiscal year
- `vw_turnover_by_cy` — separations by calendar year

### Migration B: `20260417000001_rls_policies.sql`
RLS policies for all tables. Phase 1: permissive for authenticated users.

---

## 2. Schema Changes to Existing Tables

Since the DB is empty, these are DROP + CREATE (not ALTER):

| Old Table | Action | New Table |
|-----------|--------|-----------|
| employees | DROP + CREATE | employees (new columns) |
| training_types | DROP | trainings (new) |
| training_requirements | DROP | requirements (new) |
| completions | DROP + CREATE | completions (expanded) |
| classes | DROP | sessions (new) |
| class_enrollments | DROP | (enrollments handled via sessions) |
| signin_sessions | DROP | (kiosk flow uses review_queue) |
| unresolved_people | DROP | review_queue (consolidated) |
| unknown_trainings | DROP | review_queue (consolidated) |
| import_runs | DROP | ingestion_runs (new) |
| name_aliases | DROP + CREATE | name_aliases (split names) |
| audit_log | DROP + CREATE | audit_log (new structure) |
| organizations | KEEP | Single org, still useful for settings |
| profiles | KEEP | Auth integration |
| exemptions | DROP | (handled via completions.status='exempt') |
| notification_queue | KEEP | Email system |
| recurring_class_templates | DROP | (unused, not in brief) |

---

## 3. New Routes to Add

| Route | Purpose | Priority |
|-------|---------|----------|
| `/` | HR Home (today's queue, stats, quick actions) | P0 |
| `/training` | Training dashboard, compliance summary | P0 |
| `/training/catalog` | Manage trainings + cadences (inline edit) | P0 |
| `/training/employees` | Employee x training compliance grid | P0 |
| `/training/sessions` | Scheduled sessions | P1 |
| `/new-hires` | Pipeline kanban | P0 |
| `/new-hires/[id]` | Hire detail + checklist | P0 |
| `/new-hires/new` | Add hire form | P0 |
| `/new-hires/import` | Bulk import from tracker | P1 |
| `/separations` | Table with CY/FY toggle | P0 |
| `/separations/[id]` | Detail + offboarding checklist | P0 |
| `/separations/new` | Log separation form | P0 |
| `/analytics` | Cross-pillar dashboard | P1 |
| `/ingestion` | Run history + review queue + manual sync | P0 |
| `/settings` | Source files, schedules, audit export | P1 |
| `/api/ingest/sheets` | Cron: pull Google Sheets A+B | P0 |
| `/api/ingest/employee-master` | Manual: Source A | P0 |
| `/api/ingest/attendance-tracker` | Manual: Source B | P0 |
| `/api/ingest/file` | Manual: process uploaded file | P1 |
| `/api/ingest/runs` | GET: recent runs | P1 |
| `/api/ingest/review/[id]/resolve` | POST: resolve queue item | P0 |
| `/api/employees` | CRUD | P0 |
| `/api/trainings` | CRUD + bulk-cadence | P0 |
| `/api/completions` | CRUD | P0 |
| `/api/new-hires` | CRUD + stage transition | P0 |
| `/api/separations` | CRUD | P0 |
| `/api/reports/compliance` | JSON/CSV snapshot | P1 |
| `/api/reports/audit-packet` | PDF zip | P2 |

---

## 4. Components to Build (New)

| Component | Type | Purpose |
|-----------|------|---------|
| `HRHome` | Server | Today's queue, stat cards, quick actions |
| `TrainingDashboard` | Server | Compliance heatmap + overdue queue |
| `TrainingCatalog` | Client | Inline-editable training table |
| `ComplianceGrid` | Client | Sticky-header employee x training matrix |
| `PipelineKanban` | Client | Drag-and-drop hire stages |
| `HireDetail` | Server | Profile + checklist |
| `SeparationsTable` | Client | CY/FY toggle, filterable |
| `SeparationDetail` | Server | Record + offboarding checklist |
| `AnalyticsDashboard` | Server | Scorecard, retention curves, turnover charts |
| `IngestionConsole` | Client | Run history + review queue + sync buttons |
| `FileUploadDropzone` | Client | Auto-detect source by filename |
| `ReviewQueueTable` | Client | Confirm/skip/alias per row |
| `StatCard` | Client | Fraunces big number + sparkline |
| `StatusPill` | Client | Compliant/overdue/exempt/due_soon |

---

## 5. Components to Replace (Restyle)

All existing components get restyled per Section 8 of the brief:

| Component | Change |
|-----------|--------|
| globals.css | New color tokens (warm off-white, forest green, terracotta, amber) |
| All pages | Fraunces headings + Inter body. New typography scale. |
| Sidebar | 240px fixed, warm palette, accent left border |
| Tables | No zebra stripes, hairline dividers, caption headers |
| Buttons | Flat, no gradients, --accent primary |
| Cards | p-6 to p-8, hairline borders, no shadows |
| Charts | Strip Recharts defaults, faint horizontals only |
| Empty states | Literary one-liners in Fraunces italic |

---

## 6. Components to Delete

| Component | Reason |
|-----------|--------|
| compliance-mini-chart.tsx | Replaced by full training dashboard |
| import-panel.tsx | Replaced by ingestion console |
| kiosk-sign-in-form.tsx | Keep but restyle |
| class-day-attendance-table.tsx | Replaced by session attendance |

---

## 7. New Files to Create

```
scripts/ingest/
  index.ts              # CLI entry point
  resolver.ts           # Name matching ladder (7 steps)
  nicknames.ts          # EVC nickname dictionary
  normalize.ts          # Date, status, value parsers
  idempotency.ts        # Row hashing for dedup
  runLogger.ts          # ingestion_runs + audit_log writer
  sources/
    employeeMaster.ts   # Source A: Google Sheet CSV
    attendanceTracker.ts # Source B: Google Sheet CSV
    newHireTracker.ts   # Source C: XLSM
    separationSummary.ts # Source D: XLSX
    paylocityImport.ts  # Source E: CSV

data/
  sources/.gitkeep      # Drop zone for files
```

---

## 8. Build Order

1. Schema migration + generate TS types
2. lib/ utilities: resolver, nicknames, normalizer, idempotency, run logger
3. Source A (Employee Master) + Source D (Separations) ingestion. Seed.
4. Source C (New Hire Tracker) ingestion. Seed.
5. Source B (Attendance Tracker) ingestion. Seed. Set up cron.
6. Design system: fonts, colors, layout shell
7. HR Home page
8. Separations table + detail + form
9. New Hires pipeline + detail + form
10. Training Catalog (inline edit + cadence config)
11. Training dashboard + compliance grid
12. Analytics page
13. Ingestion console + review queue
14. Polish pass
