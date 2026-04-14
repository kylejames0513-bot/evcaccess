"""
Stage 4 (surgical redo) -- HubSync macro handoff.

Intentionally does NOT modify the xlsx at all.

The HubSync.bas in this folder creates its own "Sync Log" sheet on
first run (via Worksheets.Add from inside VBA), tracks previously-
synced rows via that sheet, and does not require any columns to
be added to the FY sheets. This keeps Stage 4 zero-risk.

Install steps: see README.md. Summary:
  1. Open the xlsx in Excel.
  2. File -> Save As -> Excel Macro-Enabled Workbook (.xlsm).
  3. Alt+F11 -> File -> Import File -> HubSync.bas.
  4. (Optional) Developer -> Insert -> Button on the Dashboard,
     assign macro HubSync.HubSync.
  5. Save.
"""
import sys


def main() -> None:
    print("[stage4] no workbook changes. Import scripts/separation-summary/HubSync.bas")
    print("[stage4] see scripts/separation-summary/README.md for install steps")


if __name__ == "__main__":
    main()
