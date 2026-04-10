# 11 Import Formats

Extracted from `Google Sheets/EVC_Attendance_Tracker (2).xlsx` so the resolver in Step 2.5 knows exactly what it's parsing. Not every tab becomes an importable CSV; flagged where the rework replaces the tab vs ingests it.

## Workbook sheets

| Sheet | Rows | Cols | Role in rework |
|---|---|---|---|
| Training Records | 1002 | 26 | Historical sign-in form output. Replaced by public sign-in page. Still an ingest source for the cutover. |
| Merged | 2226 | 40 | Intermediate cache produced by Apps Script. Not an import source. |
| Attendee Name Fixes | 2 | 4 | Empty-ish fix sheet. Not needed; resolution review replaces it. |
| Training | 3169 | 42 | Rolled-up per-employee matrix. Replaced by compliance dashboard. Not an import source. |
| Paylocity Import | 1416 | 25 | **Canonical Paylocity CSV ingest source.** |
| PHS Import | 3293 | 26 (7 real) | **Canonical PHS CSV ingest source.** |
| Employees | 1000 | 26 (10 real) | **Canonical Employees ingest source.** 387 Active + 159 Terminated = 546 data rows. |
| Access | 2243 | 37 | **Historical Access ingest source**, per-employee matrix of training columns. |
| Scheduled | 229 | 7 | Sessions scheduler. Replaced by `/schedule` page. Not an import source. |
| Hub Settings | 42 | 3 | App config today (dept rules, name_map, sync_log, capacity). Seeds the new `required_trainings` and `training_aliases`. |
| Archive | 2 | 7 | Empty-ish archived sessions. Not needed. |

---

## 1. Paylocity Import

### Headers (25 columns, row 1)

`Company Code`, `Employee Id`, `Last Name`, `First Name`, `Middle Name`, `Preferred/First Name`, `Division Description`, `Department Description`, `Position Title`, `Skill`, `Code`, `Effective/Issue Date`, `Expiration Date`, `Record Type`, `Skill Status`, `Issuing Organization`, `Issuing State/Country`, `License/Cert/ID Number`, `Cost`, `Notes`, `Training/Course Name`, `Instructor`, `Training/CEU Hours`, `Training Score`, `Completion Date`

### Key fields for ingest

- `Employee Id` = canonical `employee_number` (Paylocity ID). 1415 data rows. **Always present.**
- `Last Name`, `First Name`, `Preferred/First Name` for employee row upsert (display only after the ID match).
- `Department Description` for required_trainings matching.
- `Position Title` for position-level overrides.
- `Skill` + `Code` for training name. `Code` is the short identifier, `Skill` is often the same or a human-readable variant. Use `Code` as the primary lookup into `training_aliases`; fall back to `Skill`.
- `Effective/Issue Date` = completion_date. Python date. `Expiration Date` = expiration_date (nullable).
- `Record Type` is always `Current` (1415/1415 rows). Can be ignored.

### Distinct `Skill | Code` values and counts (top 25)

| count | Skill | Code |
|---:|---|---|
| 367 | CPR.FA | CPR |
| 234 | UKERU | Ukeru |
| 209 | Med Training | Med Training |
| 117 | Pers Cent Thnk | Pers Cent Thnk |
| 95 | Mealtime Instructions | Mealtime Instructions |
| 93 | Driver's License | DL |
| 59 | MVR | MVR |
| 49 | Safety Care | Safety Care |
| 41 | Post Med | Post Med |
| 26 | Behavior Training | Behavior Training |
| 20 | Active Shooter | Active Shooter |
| 19 | Rights Training | Rights Training |
| 19 | CPM | CPM |
| 15 | Insurance | Insurance |
| 12 | Meaningful Day | Meaningful Day |
| 9 | Person Centered Thinking | Person Centered Thinking |
| 8 | PFH/DIDD | PFH/DIDD |
| 7 | POM | POM |
| 6 | Skills System | Skills System |
| 3 | Shift | Shift |
| 2 | Vehicle Insurance Declination Page | Veh Ins Declination |
| 1 | Background | Background |
| 1 | Title VI | Title VI |
| 1 | TRN | TRN |
| 1 | Basic VCRM | Basic VCRM |

Aliases to preserve (source:paylocity): `CPR.FA → CPR/FA`, `UKERU → Ukeru`, `Med Training → Med Recert` or `Initial Med Training` (needs disambiguation per row), `Person Centered Thinking → Pers Cent Thnk`, `Mealtime Instructions → Mealtime`, `Driver's License / DL / MVR / Insurance / Background / Veh Ins Declination` are NOT compliance trainings (HR file docs). Resolver should route them to `unknown_trainings` unless we explicitly flag them as non-training rows to skip.

### Date format

Python datetime objects when parsed with openpyxl `data_only=True`. In the raw Paylocity CSV export, dates come through as `MM/DD/YYYY` text. The ingest parser needs to handle both.

---

## 2. PHS Import

### Headers (7 real columns; rest are padding)

`Employee Name`, `Upload Category`, `Upload Type`, `Effective Date`, `Expiration Date`, `Termination Date`, `View File`

### Key fields for ingest

- `Employee Name` is a single string in `Last, First` format. **No Paylocity ID.** Must be resolved by name against `employees.aliases` and `(last_name, first_name)`.
- `Upload Category` + `Upload Type` form the training identifier.
- `Effective Date` = completion_date. `Expiration Date` = expiration_date.
- `Termination Date` rarely present, ignore for training records.
- `View File` is a URL or text, not data for the DB.

### Distinct `Upload Category | Upload Type` values

| count | Category | Type |
|---:|---|---|
| 589 | CPR/FA | CPR Card |
| 481 | Drivers License | Driver's License |
| 298 | Med Admin | Certification |
| 164 | Additional Training | Behavior Training |
| 132 | Additional Training | General Training |
| 39 | Additional Training | Safety Care |
| 33 | Additional Training | In-Service |
| 26 | CPR/FA | Certification |
| 5 | Med Admin | No Show |
| 4 | Med Admin | Fail |
| 2 | CPR/FA | License |

Aliases to preserve (source:phs):

- `CPR/FA | CPR Card` → `CPR/FA`
- `CPR/FA | Certification` → `CPR/FA`
- `CPR/FA | License` → `CPR/FA`
- `Med Admin | Certification` → `Med Recert`
- `Med Admin | No Show` → **NOT** a completion, goes to `unresolved_people` as a no_show flag
- `Med Admin | Fail` → **NOT** a completion, goes to `unresolved_people` as a fail flag
- `Additional Training | Behavior Training` → `Behavior Training` (per Paylocity alias)
- `Additional Training | Safety Care` → `Safety Care`
- `Additional Training | In-Service` → `unknown_trainings` (too vague)
- `Additional Training | General Training` → `unknown_trainings`
- `Drivers License | Driver's License` → non-training, skip

---

## 3. Access

### Headers (37 columns)

`L NAME`, `F NAME`, `ACTIVE`, then per-training date columns: `CPR`, `FIRSTAID`, `MED_TRAIN`, `POST MED`, `Mealtime`, `CPI`, `Ukeru`, `Safety Care`, `CPM`, `MC`, `ADV SHIFT`, `SHIFT`, `ETIS`, `Meaningful Day`, `MD refresh`, `GERD`, `HCO Training`, `Health Passport`, `Diabetes`, `Falls`, `Dysphagia Oveview` (sic), `PFH_DIDD`, `POM`, `Skills System`, `Skills Online`, `Rights Training`, `Title VI`, `TRN`, `Active Shooter`, `Basic VCRM`, `Advanced VCRM`, `VR`, `ASL`, `Pers Cent Thnk`

### Shape

- Not a flat list, a **wide matrix**. One row per employee, one column per training, cell value is either a completion date, empty, or a free-text excusal code like `FACILITIES`, `ELC`, `NA`.
- No Paylocity ID. Name match only.
- 2242 data rows.

### Resolver rules for Access

- Pivot wide to long: for each (row, training_column) pair where the cell has a date, emit one `completion` with `source = 'access'`.
- If the cell is a non-date string (`NA`, `FACILITIES`, `ELC`, etc.), emit an `excusal` with `reason = <string>`, `source = 'access'`. Do NOT emit a completion.
- Empty cells are skipped.
- `Dysphagia Oveview` typo is canonical in the source. Alias it to `Dysphagia Overview` in `training_aliases`.

---

## 4. Employees

### Headers (10 real columns)

`Last Name`, `Suffix`, `First Name`, `Preferred Name`, `ID`, `Position / Job Title`, `Hire Date`, `Division`, `Department`, `Status`

### Key fields for ingest

- `ID` = canonical `employee_number`.
- `Status` is either `Active` (387 rows) or `Terminated` (159 rows).
- `Hire Date` is a real date.
- `Division` is one of the HR divisions (Residential, Facilities, Children Services, etc.).
- `Department` is the sub-department under the division.
- `Position / Job Title` is the job title for position-level requirement overrides.

Note: the xlsx Employees tab only has 546 rows (387 active + 159 terminated). The live DB has 2225 employees total, 1838 of them inactive. That means the DB has absorbed many historical people not on the current sheet. Cutover should not delete them.

---

## 5. Training Records (legacy sign-in sheet)

### Headers

`Arrival Time`, `Training Session`, `Attendee Name`, `Date of Training`, `Left Early`, `Reason`, `Notes / Issues`, `Session End Time`, `Session Length`, `Pass / Fail`, `Reviewed By`

This is the output of the old Google Form sign-in. The rework replaces it with the public sign-in page (target feature 7.2). For cutover, each row becomes a `completion` with `source = 'signin'`. `Attendee Name` is full name, needs resolver.

---

## 6. Hub Settings

Kyle's current app config, split across 6 row `type` values:

| type | count | shape | becomes |
|---|---|---|---|
| capacity | 1 | key=training name, value=capacity number | stays in `hub_settings` |
| compliance | 5 | key=column_key, value=empty | replaced by `training_types.is_compliance_tracked` boolean |
| dept_rule | 12 | key=department, value=`<tracked>\|<required>` CSV pipe CSV | replaced by `required_trainings` rows |
| name_map | 18 | key=`Old Last, First`, value=`New Last, First` | replaced by `employees.aliases` array |
| no_show | 1 | key=person name, value=`training\|date range` | replaced by a no_shows table or notes |
| sync_log | 4 | key=ISO timestamp, value=JSON | replaced by `imports` run log table |

### compliance rows (the trainings that actually matter for compliance today)

- CPR
- Ukeru
- Mealtime
- MED_TRAIN
- POST MED

### name_map rows (canonical aliases to import)

| Old (Last, First) | New (Last, First) |
|---|---|
| Abney, Michael | Abney, Michael "Mike" |
| Johnson, Jamie | Johnson, Jamie "Jamie" |
| McCarter, Zackary | McCarter, Zachary |
| Shanklin, Sandra | Shanklin, Sandi |
| Livesey-Lum, Iolani | Livesey-Lum, Lani |
| Thompson, Mary | Thompson, Cindy |
| Watson, Heather | Watson, Nikki |
| Hicks, Abbigayle | Hicks, Abbi |
| Akerele, Abimbola | Akerele, Bimbor |
| Dalton, Madison | Dalton, Madilynn |
| Frank, Niyonyishu (Frank) | Frank, Frankie |
| Lane, Samantha | Lane, Hope |
| Polacco, Cassandra | Polacco, Cassie |
| Price, Richard | Price, Aaron |
| Sammons, Raeleah | Sammons, Maleah |
| Stanley, Melanie | Stanley, Mel |
| Devlin, Samantha | Devlin, Sam |
| Rhodes Hancock, Wendy | Lineberger, Wendy |

All 18 get seeded into `employees.aliases` during cutover. The last one (`Rhodes Hancock → Lineberger`) is a legal-name-change case and needs a one-off match.

### dept_rule rows (current department requirements)

| Department | tracked = required (both sides of pipe are the same) |
|---|---|
| Board | (empty) |
| Residential | CPR, Mealtime, MED_TRAIN, POST MED, Ukeru |
| Human Resources | Ukeru, VR, CPR |
| Finance | Ukeru, CPR |
| Executive | CPR, Ukeru |
| Behavioral Health | Mealtime, Ukeru, CPR |
| Community Engagement | CPR |
| Children Services | CPR |
| Family Support | Ukeru, CPR |
| Facilities | CPR |
| Professional Services | CPR |
| Workforce Innovation | CPR, Ukeru |

All of these become rows in the new `required_trainings(department, training_type_id, is_required)` table. Plus, per Kyle's answer in chat, the new table also supports a nullable `position` column for within-department overrides (e.g. Case Management inside a department needing Med Cert when others don't).
