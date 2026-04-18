# EVC_Attendance_Tracker.xlsx → Training Hub

This documents how the app reads the workbook at `workbooks/EVC_Attendance_Tracker.xlsx`. Only **allowlisted** sheet names are parsed.

## Sheets used by imports

| Sheet tab   | Import path                         | Required columns (headers)                                                                 |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| **Merged**  | “Merged → employees” on `/imports` | `ID`, `L NAME`, `F NAME`, `ACTIVE`, `Division`, `Hire Date`                                |
| **Training** | “Training matrix → completions”    | Demographics: `ID`, `Hire Date`, `L NAME`, `F NAME`, `ACTIVE`, `Division Description`, `Department Description`, `Position Title`, `Aliases`. Every other column is a **course name**; a cell is imported as a completion **only if** the value parses as a date. |

## Training catalog matching

Completion rows use the **column header** as the training name. It must match a `training_types.name` value in your org (case-insensitive trim), or rows land in **Review → unknown trainings**.

## Employee ID

`Merged` and `Training` use column **`ID`** as `employees.paylocity_id` (stable join key).

## Preview cap

Training matrix previews include at most **4000** completion rows. Run another import after commit if you need more.

## CSV export (Excel round-trip)

Authenticated download: `/api/exports/merged-employees-csv` — columns `ID`, `L NAME`, `F NAME`, `ACTIVE`, `Division`, `Hire Date` aligned with the **Merged** layout.

## Inspect locally

```bash
npm run inspect:evc-xlsx
npm run inspect:evc-xlsx -- "path/to/other.xlsx"
```
