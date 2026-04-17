# VBA Integration — Monthly New Hire Tracker

## Setup

1. Open `Monthly New Hire Tracker.xlsm`
2. Press `Alt+F11` to open the VBA editor
3. **Import HubIntegration.bas**: File → Import File → select `vba/HubIntegration.bas`
4. **Add auto-menu**: Double-click `ThisWorkbook` in the left panel, paste the contents of `vba/ThisWorkbook.cls`
5. Close VBA editor, save the XLSM
6. Reopen the file — you'll see an "HR Hub" menu in the ribbon

## Menu Options

| Menu Item | What It Does |
|-----------|--------------|
| **Pull Trainings for This Sheet** | Fetches CPR/FA, Med Cert, UKERU, Mealtime from `completions` (existing employees) |
| **Pull Trainings for ALL Months** | Same, but loops every monthly sheet |
| **Pull Onboarding Status for This Sheet** | Fetches the new-hire checklist (`new_hire_checklist`) so the tracker reflects what HR has checked off on the hub |
| **Push New Hires to Hub** | Upserts each NH/TR row into `new_hires`, seeds the template checklist |
| **Push Completions to Hub** | Sends Yes/No/N/A training status as `completions` rows |
| **Test Connection** | Verifies the Hub API is reachable |

## Column Mapping

The VBA reads columns based on this standard layout:

| Col | Letter | Purpose |
|-----|--------|---------|
| 1   | A | # |
| 2   | B | Dept |
| 3   | C | Last Name |
| 4   | D | First Name |
| 5   | E | Bkgrd (background check) |
| 6   | F | DOH (Date of Hire) |
| 7   | G | Location / Title |
| 8   | H | Assigned (recruiter) |
| 9   | I | Relias (recruiter) |
| 10  | J | 3-Phase |
| 11  | K | Job Desc |
| 12  | L | CPR/FA |
| 13  | M | Med Cert |
| 14  | N | UKERU |
| 15  | O | Mealtime |
| 16  | P | Therapy |
| 17  | Q | ITSP |
| 18  | R | Delegation |
| 19  | S | Status |
| **20**  | **T** | **Residential? (new hires) / Lift Van Required? (transfers)** |
| **21**  | **U** | **New Job Desc Required? (transfers)** |

Rows: New hires **5–54**, Transfers **59–108**.

> **New columns T and U.** Add these to each monthly sheet. Put `Y` / `Yes` / `X` to flag, anything else (blank, `N`, `No`) is treated as false.

If your columns differ, update the `COL_*` constants at the top of `HubIntegration.bas`.

## Hub API contract

- **Pull per-employee** — `GET /api/vba?action=getTrainings&firstName=X&lastName=Y`
- **Pull per-new-hire** — `GET /api/vba?action=getOnboarding&firstName=X&lastName=Y` → returns `{ cpr, ukeru, mealtime, medCert, liftVan }` where each value is either a `YYYY-MM-DD` date, the string `"Yes"`, or `null`.
- **Pull a month** (batch) — `GET /api/vba?action=pullOnboardingStatus&month=YYYY-MM&section=new_hire|transfer`
- **Push new hire** — `POST /api/vba` with `{ action: "pushNewHire", hireType, firstName, lastName, department, locationTitle, backgroundCheck, dateOfHire, isResidential, liftVanRequired, newJobDescRequired, month, year }`
- **Push completion** — `POST /api/vba` with `{ action: "logCompletion", firstName, lastName, trainingCode, date, status }`

## Value conventions

- **On push** — cell values of `Yes/Y/X/1/True` → `true`; anything else → `false`.
- **On pull** — a date on the hub becomes `"Yes"` in the cell with a comment `Completed YYYY-MM-DD`. Blank on the hub → cell untouched (the macro will not overwrite manual notes).
