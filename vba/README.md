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
|-----------|-------------|
| **Pull Trainings for This Sheet** | Fetches CPR/FA, Med Cert, UKERU, Mealtime status from the Hub for every employee on the active month tab |
| **Pull Trainings for ALL Months** | Same, but for all 12 monthly sheets |
| **Push New Hires to Hub** | Creates new_hires records in the Hub for employees on this sheet |
| **Push Completions to Hub** | Sends Yes/No/N/A training status to the Hub as completion records |
| **Test Connection** | Verifies the Hub API is reachable |

## Column Mapping

The VBA reads columns based on the standard layout:
- Col C (3): Last Name
- Col D (4): First Name  
- Col L (12): CPR/FA
- Col M (13): Med Cert
- Col N (14): UKERU
- Col O (15): Mealtime

If your columns differ, update the `COL_*` constants at the top of `HubIntegration.bas`.

## How It Works

- **Pull** calls `GET /api/vba?action=getTrainings&firstName=X&lastName=Y`
- **Push New Hires** calls `POST /api/vba` with `action=addNewHire`
- **Push Completions** calls `POST /api/vba` with `action=logCompletion`
- Values: "Yes" → compliant, "No" → failed, "N/A" → exempt, "In Progress" → skipped
