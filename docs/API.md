# training-hub API reference

All routes live under `/api/*` and are implemented as Next.js 16 Route
Handlers in `training-hub/src/app/api/`. Every handler is wrapped in
`withApiHandler` (see `src/lib/api-handler.ts`), which means:

- **Success**: returns `200` with a JSON object. Handlers may also return
  a raw `Response` (used for CSV exports, redirects).
- **Failure**: returns the status set by a thrown `ApiError`
  (`400`, `401`, `404`, `413`, etc.) or `500` for unknown errors.
- **Failure shape** is always `{ error: string, code: string }` so the
  UI can branch on `code` without parsing the message.
- All routes use the Supabase **service role** key (see
  `createServerClient`), which bypasses RLS. RLS is still enabled as
  defense-in-depth for any accidental anon-key calls.

Routes are grouped by purpose.

---

## Auth

| Method | Route | Purpose |
|---|---|---|
| `GET`    | `/api/auth`                            | Check session cookie / Supabase session presence |
| `POST`   | `/api/auth`                            | Log in. Body `{ email, password }` (Supabase Auth) or `{ password }` (legacy `HR_PASSWORD` fallback) |
| `DELETE` | `/api/auth`                            | Clear all auth cookies |

## Compliance & dashboards

| Method | Route | Purpose |
|---|---|---|
| `GET`  | `/api/compliance`                       | Paginated rows from `employee_compliance` view, filtered by `department`, `position`, `status`, `training_type_id`, `employee_id`. Returns rows + summary + tier decoration. |
| `GET`  | `/api/compliance-tracks`                | Read compliance track settings from `hub_settings` |
| `POST` | `/api/compliance-tracks`                | Write compliance track settings |
| `GET`  | `/api/dashboard`                        | Home-page stats: status counts, urgent issues, upcoming sessions |
| `GET`  | `/api/data-health`                      | Scan for missing fields, bad dates, dupe employees, orphan records/excusals |
| `POST` | `/api/data-health-fix`                  | Apply fix actions: `delete_orphan_records`, `delete_orphan_excusals`, `delete_bad_date_record`, `merge_duplicates` |
| `GET`  | `/api/divisions`                        | Distinct active-employee departments |
| `GET`  | `/api/positions`                        | Distinct active-employee positions. Optional `?department=` filter |
| `GET`  | `/api/export`                           | CSV export. `?type=employees \| history \| compliance`. Returns a streamed download |

## Employees

| Method | Route | Purpose |
|---|---|---|
| `GET`  | `/api/employees`                        | List employees with aggregate compliance counts. `?active=all \| true \| false`, `?department`, `?position` |
| `GET`  | `/api/employee-detail?id=<uuid>`        | Full detail: employee, history, master_completions, excusals, compliance |
| `GET`  | `/api/employee-detail?name=<string>`    | Legacy name-based lookup for `EmployeeDetailModal` |
| `GET`  | `/api/new-hires`                        | Employees hired in the last 90 days with completion progress |
| `GET`  | `/api/needs-training?training=<name>`   | Employees who need a specific training (used by scheduler auto-fill) |

## Trainings

| Method | Route | Purpose |
|---|---|---|
| `GET`    | `/api/training-types`                 | All training types with aliases |
| `POST`   | `/api/training-types`                 | Create training type |
| `GET`    | `/api/training-types/[id]`            | One training type + aliases |
| `PATCH`  | `/api/training-types/[id]`            | Update training type |
| `POST`   | `/api/training-types/[id]`            | `{ action: 'add_alias' }` or `{ action: 'remove_alias' }` |
| `GET`    | `/api/training-detail?id=<id>`        | Training type + history + compliance roster |
| `GET`    | `/api/training-records`               | Flat list of all completion records |
| `GET`    | `/api/training-notes`                 | `?employee=<name>` returns all notes for that employee |
| `POST`   | `/api/training-notes`                 | Upsert or delete a training note |
| `POST`   | `/api/record-completion`              | Manually record a completion for an employee |

## Required trainings (rules engine)

| Method | Route | Purpose |
|---|---|---|
| `GET`    | `/api/required-trainings`             | All rules (universal / dept / position) |
| `POST`   | `/api/required-trainings`             | Create a rule. Validates that non-universal rules have dept/position |
| `GET`    | `/api/required-trainings/[id]`        | Get one rule |
| `PATCH`  | `/api/required-trainings/[id]`        | Update a rule |
| `DELETE` | `/api/required-trainings/[id]`        | Delete a rule |
| `GET`    | `/api/dept-rules`                     | **Legacy** dept rules from `hub_settings`. Superseded by `required-trainings`; slated for removal |
| `POST`   | `/api/dept-rules`                     | **Legacy** set/remove dept rule |

## Excusals

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/excusal`                          | Set/clear a single excusal by employee name + column_key |
| `POST` | `/api/excusal/remove`                   | Delete an excusal by `employee_id` + `training_type_id` |
| `POST` | `/api/bulk-excuse`                      | Excuse many employees at once by division or name list |
| `POST` | `/api/exclude`                          | **Stub** — returns `{ ok: true }`; exclusion replaced by `is_active=false` |
| `GET`  | `/api/excluded-list`                    | **Stub** — always returns `{ excluded: [] }` |

## Imports

| Method | Route | Purpose |
|---|---|---|
| `GET`    | `/api/imports`                        | Run log (newest first). `?status=` to filter |
| `POST`   | `/api/imports`                        | Preview an import. Body `{ source, rows[], filename? }`. Enforces 50k row cap and per-source header check. Returns `import_id` + summary |
| `GET`    | `/api/imports/[id]`                   | Get one import row + preview payload |
| `POST`   | `/api/imports/[id]`                   | `{ action: 'commit' }` or `{ action: 'fail', error }` |
| `DELETE` | `/api/imports/[id]`                   | Delete a preview-status import |

## Review queue

| Method | Route | Purpose |
|---|---|---|
| `GET`  | `/api/review/people`                    | Paginated unresolved-people queue. `?page`, `?page_size` (max 500), `?source`, `?reason`, `?search`, `?open` |
| `POST` | `/api/review/people/[id]`               | Resolve to employee. Backfills the training record and adds a name alias |
| `GET`  | `/api/review/trainings`                 | Paginated unknown-trainings queue. `?page`, `?page_size`, `?source`, `?search` |
| `POST` | `/api/review/trainings/[id]`            | Resolve to training_type. Adds a training alias |

## Sessions & enrollments (out-of-scope per PLAN.md — kept for legacy UI)

| Method | Route | Purpose |
|---|---|---|
| `GET`  | `/api/sessions/[id]`                    | Session detail + enrollees + walk-ins + next sessions |
| `POST` | `/api/sessions/[id]`                    | `{ action: 'review' \| 'archive' \| 'reopen' \| 'add_to_session' }` |
| `POST` | `/api/create-session`                   | Create a new session |
| `POST` | `/api/edit-session`                     | Patch training/date/time/location |
| `POST` | `/api/delete-session`                   | Delete a session |
| `GET`  | `/api/schedule`                         | Upcoming sessions (auto-prunes enrollees who already have the cert) |
| `POST` | `/api/enroll`                           | Add enrollees (or `action: 'remove_all'`) |
| `POST` | `/api/remove-enrollee`                  | Remove one enrollee |
| `GET`  | `/api/capacities`                       | **Stub** — `{ capacities: {} }` |
| `POST` | `/api/capacity`                         | **Stub** — `{ ok: true }` |
| `POST` | `/api/no-shows`                         | **Stub** — `{ ok: true }` |
| `GET`  | `/api/no-show-flags`                    | **Stub** — `{ flags: {} }` |
| `POST` | `/api/no-show-flags`                    | **Stub** — `{ ok: true }` |

## Public sign-in

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/signin`                           | Public self-service sign-in. Runs the resolver, commits immediately, auto-links to a scheduled session if one exists for today |

## Reports

| Method | Route | Purpose |
|---|---|---|
| `GET`  | `/api/reports?type=department`          | Compliance rate per division |
| `GET`  | `/api/reports?type=training`            | Completion rate per training type |
| `GET`  | `/api/reports?type=forecast`            | 12-month expiration forecast |
| `GET`  | `/api/reports?type=needs`               | Who-needs-what matrix |
| `POST` | `/api/send-report`                      | Build a text report for email. Body `{ scope: 'expired' \| 'expired_expiring' \| 'full' }` |

## System & settings

| Method | Route | Purpose |
|---|---|---|
| `GET`  | `/api/sync-log`                         | Recent sync events |
| `GET`  | `/api/sync-status`                      | Row counts + last sync snapshot |
| `POST` | `/api/refresh`                          | **No-op** — legacy cache-invalidate hook |
| `GET`  | `/api/thresholds`                       | **Stub** — default 30/60/90 thresholds |
| `POST` | `/api/thresholds`                       | **Stub** — `{ ok: true }` |

---

## Error contract

```ts
// Success
200 { …data }

// Thrown ApiError (recommended)
4xx { error: "training_type_id is required", code: "missing_field" }

// Unknown error (logged server-side, generic client response)
500 { error: "Database connection failed", code: "internal" }
```

**Error codes used across the API:**

| `code`              | When it fires |
|---|---|
| `bad_request`       | Generic 400. Usually an unknown action or malformed body |
| `missing_field`     | A required field is absent |
| `invalid_field`     | A field is present but not the right shape / not a known enum |
| `not_found`         | Lookup by id returned nothing |
| `conflict`          | Not currently used; reserved for upsert conflicts |
| `unauthorized`      | 401 from /api/auth |
| `forbidden`         | Reserved for future RLS enforcement |
| `payload_too_large` | /api/imports rejecting a file over the 50k row cap |
| `unprocessable`     | Reserved |
| `internal`          | 500 fallback |

## Adding a new route

```ts
// src/app/api/my-route/route.ts
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const GET = withApiHandler(async (req) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError("id required", 400, "missing_field");
  // …do the work…
  return { ok: true, id };
});
```

That's it — no try/catch, no manual `Response.json`. The wrapper handles
error shaping, status codes, and stderr logging.
