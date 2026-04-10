# 06 Routes

All paths relative to `training-hub/src/app/`. Every page file contains `"use client"` (all 16 pages are client components). Layout file `layout.tsx` is server.

| route_path | file | kind | client/server | description |
|---|---|---|---|---|
| / | page.tsx | page | client | Dashboard with compliance stats and urgent issues |
| /archive | archive/page.tsx | page | client | Lists archived training sessions with filters |
| /attendance | attendance/page.tsx | page | client | Manages attendance and no-shows for sessions |
| /compliance | compliance/page.tsx | page | client | Shows compliance issues by employee/training |
| /data-health | data-health/page.tsx | page | client | Displays database quality issues and fixes |
| /employees | employees/page.tsx | page | client | Lists employees with compliance status overview |
| /login | login/page.tsx | page | client | User authentication form with dual modes |
| /new-hires | new-hires/page.tsx | page | client | Tracks recent hires and missing trainings |
| /notifications | notifications/page.tsx | page | client | Sends compliance alerts to stakeholders |
| /records | records/page.tsx | page | client | Displays all training completion records |
| /reports | reports/page.tsx | page | client | Analytics dashboards for compliance data |
| /schedule | schedule/page.tsx | page | client | Creates/edits training sessions and enrollments |
| /schedule/print | schedule/print/page.tsx | page | client | Print friendly schedule view for upcoming sessions |
| /settings | settings/page.tsx | page | client | Configures department rules and training capacity |
| /sync | sync/page.tsx | page | client | Displays sync status and operation history |
| /trainings | trainings/page.tsx | page | client | Lists trainings with customizable capacities |
| /api/archive-session | api/archive-session/route.ts | api | server | POST archives a training session by ID |
| /api/archived | api/archived/route.ts | api | server | GET retrieves archived training sessions |
| /api/auth | api/auth/route.ts | api | server | POST authenticates via email/password or legacy |
| /api/board-excuse | api/board-excuse/route.ts | api | server | POST excuses board members from all trainings |
| /api/bulk-excuse | api/bulk-excuse/route.ts | api | server | POST excuses multiple employees from trainings |
| /api/capacities | api/capacities/route.ts | api | server | GET retrieves training capacity overrides |
| /api/capacity | api/capacity/route.ts | api | server | POST sets capacity override for a training |
| /api/compliance | api/compliance/route.ts | api | server | GET returns compliance issues with expiration thresholds |
| /api/compliance-tracks | api/compliance-tracks/route.ts | api | server | GET/POST manages compliance tracking configuration |
| /api/create-session | api/create-session/route.ts | api | server | POST creates new training session with enrollees |
| /api/dashboard | api/dashboard/route.ts | api | server | GET builds dashboard stats from training data |
| /api/data-health | api/data-health/route.ts | api | server | GET scans database for quality issues |
| /api/data-health-fix | api/data-health-fix/route.ts | api | server | POST applies data quality fixes to database |
| /api/debug | api/debug/route.ts | api | server | GET dumps raw employee data for debugging |
| /api/delete-session | api/delete-session/route.ts | api | server | POST deletes training session by ID |
| /api/dept-rules | api/dept-rules/route.ts | api | server | GET/POST manages department training rules |
| /api/divisions | api/divisions/route.ts | api | server | GET lists all active employee divisions |
| /api/edit-session | api/edit-session/route.ts | api | server | POST updates session date/time/location/training |
| /api/employee-detail | api/employee-detail/route.ts | api | server | GET returns single employee training details |
| /api/employees | api/employees/route.ts | api | server | GET lists all employees with compliance status |
| /api/enroll | api/enroll/route.ts | api | server | POST adds employees to training session |
| /api/exclude | api/exclude/route.ts | api | server | POST adds/removes employees from exclusion list |
| /api/excluded-list | api/excluded-list/route.ts | api | server | GET retrieves currently excluded employees |
| /api/excusal | api/excusal/route.ts | api | server | POST marks training as excused for employee |
| /api/name-map | api/name-map/route.ts | api | server | GET/POST manages name mappings for sync |
| /api/needs-training | api/needs-training/route.ts | api | server | GET lists employees needing specific training |
| /api/new-hires | api/new-hires/route.ts | api | server | GET finds employees within 90 days of hire date |
| /api/no-show-flags | api/no-show-flags/route.ts | api | server | GET/POST manages no-show incident tracking |
| /api/no-shows | api/no-shows/route.ts | api | server | POST records no-shows for training session |
| /api/record-completion | api/record-completion/route.ts | api | server | POST records training completion for employee |
| /api/refresh | api/refresh/route.ts | api | server | POST no-op endpoint for cache invalidation |
| /api/remove-enrollee | api/remove-enrollee/route.ts | api | server | POST removes employee from training session |
| /api/reports | api/reports/route.ts | api | server | GET generates compliance reports by type |
| /api/schedule | api/schedule/route.ts | api | server | GET returns all scheduled training sessions |
| /api/send-report | api/send-report/route.ts | api | server | POST generates and formats compliance report |
| /api/sync-log | api/sync-log/route.ts | api | server | GET retrieves sync history and operation log |
| /api/sync-status | api/sync-status/route.ts | api | server | GET returns employee/record counts and log |
| /api/thresholds | api/thresholds/route.ts | api | server | GET/POST manages expiration warning thresholds |
| /api/training-notes | api/training-notes/route.ts | api | server | GET/POST manages per-employee training notes |
| /api/training-records | api/training-records/route.ts | api | server | GET returns all training completion records |

Total: 16 page routes, 40 API routes, 1 root layout. There is no imports page, no public sign in page, no employee detail page as a UI route (employee detail exists only as an API endpoint), no training detail page, no resolution review UI, no run log UI beyond `/sync`.
