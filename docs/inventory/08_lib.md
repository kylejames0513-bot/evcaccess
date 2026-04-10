# 08 Lib

All paths relative to `training-hub/src/`. This is the helper + data access layer.

| path | lines | description |
|---|---|---|
| lib/supabase.ts | 14 | Exports browser `supabase` client plus `createServerClient()` that uses the service role key |
| lib/training-data.ts | 919 | Primary data layer: `getTrainingData`, `getComplianceIssues`, `getDashboardStats`, `getScheduledSessions`, `recordCompletion`, `setExcusal`, `getEmployeeList`, `getEmployeesNeedingTraining`, `createSession`, `addEnrollees`, `removeEnrollee`, `deleteSession`, `archiveSession`, `getArchivedSessions`, `recordNoShows` |
| lib/hub-settings.ts | 298 | Supabase backed hub settings: excluded employees, capacity overrides, expiration thresholds, sync log, compliance tracks, no shows, dept rules |
| lib/import-utils.ts | 209 | Paylocity/PHS import helpers: `normalizeDate`, `parseToTimestamp`, `datesEqual`, `FixEntry`, `applyFixesToSupabase`, `loadNameMappingsFromSupabase` |
| lib/name-utils.ts | 198 | Name matching: `normalizeNameForCompare`, `namesMatch`, `toFirstLast`, `nameMatchScore`, `suggestNameMatches`, `NameSuggestion` type |
| lib/training-match.ts | 69 | Training name matching: `canonicalTrainingName`, `trainingsMatch`, `trainingMatchesAny` |
| lib/capacity-overrides.ts | 54 | JSON file backed capacity overrides (legacy, superseded by hub-settings Supabase version) |
| lib/exclude-list.ts | 42 | JSON file backed excluded employees (legacy, superseded by hub-settings Supabase version) |
| lib/use-fetch.ts | 42 | Generic client side fetch hook `useFetch<T>(url)` |
| lib/format-utils.ts | 14 | `formatDivision(name)` display helper |
| config/trainings.ts | 336 | `TrainingDef` interface, `TRAINING_DEFINITIONS` list (migrated from Config.gs), `AUTO_FILL_RULES`, `EXCUSAL_CODES`, `EXPIRING_SOON_DAYS = 60` |
| config/primary-trainings.ts | 10 | `PRIMARY_TRAININGS` filter derived from `TRAINING_DEFINITIONS` |
| types/database.ts | 176 | TypeScript types for Supabase tables (likely hand written, not generated) |

Total: 13 files, 2,381 lines. Two legacy JSON backed modules (`capacity-overrides.ts`, `exclude-list.ts`) duplicate functionality now in `hub-settings.ts`. `training-data.ts` is the single largest file and is where most Supabase reads and writes live today.
