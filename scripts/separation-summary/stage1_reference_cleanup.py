"""
Stage 1 (surgical redo) -- Reference sheet additions.

Scope:
  * Write into EMPTY cells only. Never clear, never overwrite.
  * No openpyxl. All edits go through XlsxPatcher which preserves
    every other byte in the xlsx zip.

Changes:
  Reference!B1     = "Rehire Eligibility"
  Reference!B2     = "Yes"
  Reference!B3     = "No"
  Reference!C14    = "Resignation without Notice"   (new reason)
  Reference!D1     = "Reason Category"
  Reference!D2..14 = classification for each reason in order
  Reference!H1     = "Status Meaning"
  Reference!H2     = "Uneligible for rehire"
  Reference!H3     = "Discharged / terminated"

The existing columns A (Job Titles), C (Reasons, rows 2-13),
E (Locations), G (Status), I/J (Location Mapping), L (Departments)
are never touched. Neither are row heights, column widths, styles,
merged cells, conditional formatting, or any of the custom XML or
calc chain metadata that openpyxl would drop on round-trip.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "FY Separation Summary.xlsx"
BACKUP = ROOT / "FY Separation Summary.backup.xlsx"

sys.path.insert(0, str(Path(__file__).parent))
from xlsx_patcher import XlsxPatcher  # noqa: E402
from dv_fixup import DVSpec, apply_dvs  # noqa: E402


REHIRE = [("Yes", None), ("No", None)]

# Reasons in the order they're written to C14 and D2..D14.
# The existing C2..C13 already holds the first 12 reasons in this
# order. We only write C14 (the new one) and D2..D14 (fresh category
# column). The categories match the canonical categorization:
#   Voluntary    -- employee initiated the departure
#   Involuntary  -- employer initiated (term, layoff, perf, etc.)
#   Other        -- end of contract, misc
REASON_CATEGORIES = [
    ("Attendance Issues", "Involuntary"),      # C2
    ("Better Opportunity", "Voluntary"),        # C3
    ("End of Contract", "Other"),               # C4
    ("Job Abandonment", "Involuntary"),         # C5
    ("Layoff", "Involuntary"),                  # C6
    ("Other", "Other"),                         # C7
    ("Performance Issues", "Involuntary"),      # C8
    ("Personal Reasons", "Voluntary"),          # C9
    ("Relocation", "Voluntary"),                # C10
    ("Resignation", "Voluntary"),               # C11
    ("Retirement", "Voluntary"),                # C12
    ("Termination", "Involuntary"),             # C13
    ("Resignation without Notice", "Voluntary"),  # C14 (new)
]


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")

    p = XlsxPatcher(SRC)

    # Rehire Eligibility column (B). Copy style from column A of the
    # same row so the new cells visually match the Jobs column.
    p.set_string("Reference", "B1", "Rehire Eligibility", copy_style_from="A1")
    p.set_string("Reference", "B2", "Yes", copy_style_from="A2")
    p.set_string("Reference", "B3", "No", copy_style_from="A3")

    # New row 14 entry in the Reasons column.
    p.set_string("Reference", "C14", "Resignation without Notice",
                 copy_style_from="C13")

    # Reason Category column (D). Copy style from C on the same row.
    p.set_string("Reference", "D1", "Reason Category", copy_style_from="C1")
    for i, (_, category) in enumerate(REASON_CATEGORIES):
        row = 2 + i
        p.set_string(
            "Reference", f"D{row}", category, copy_style_from=f"C{row}"
        )

    # Status Meaning column (H). Copy style from G on the same row.
    p.set_string("Reference", "H1", "Status Meaning", copy_style_from="G1")
    p.set_string(
        "Reference", "H2", "Uneligible for rehire", copy_style_from="G2"
    )
    p.set_string(
        "Reference", "H3", "Discharged / terminated", copy_style_from="G3"
    )

    p.save()
    print(f"[stage1] wrote {SRC}")

    # Re-inject the x14 data validations. Stage 1 keeps errorStyle
    # "warning" (same as the original). Stage 2 tightens to "stop".
    # Range widened: reasons list now C2:C14 (was C2:C13), rehire list
    # now points at Reference!$B$2:$B$3 (replacing the original inline
    # "Yes,No" CSV), status list stays G2:G3.
    rehire_range = "Reference!$B$2:$B$3"
    reasons_range = "Reference!$C$2:$C$14"
    status_range = "Reference!$G$2:$G$3"
    locations_range = "Reference!$E$2:$E$64"
    jobs_range = "Reference!$A$2:$A$18"
    departments_range = "Reference!$L$2:$L$10"

    def fy_specs(last_row: int) -> list[DVSpec]:
        return [
            DVSpec(formula=rehire_range, sqref=f"E9:E{last_row}",
                   style="warning",
                   error_title="Invalid Rehire",
                   error="Rehire Eligibility must be Yes or No."),
            DVSpec(formula=status_range, sqref=f"F9:F{last_row}",
                   style="warning",
                   error_title="Invalid Status",
                   error="Status must be U (uneligible) or D (discharged)."),
            DVSpec(formula=locations_range, sqref=f"G9:G{last_row}",
                   style="warning"),
            DVSpec(formula=reasons_range, sqref=f"H9:H{last_row}",
                   style="warning"),
            DVSpec(formula=jobs_range, sqref=f"K9:K{last_row}",
                   style="warning"),
            DVSpec(formula=departments_range, sqref=f"M9:M{last_row}",
                   style="warning"),
        ]

    # FY 2026 uses its ORIGINAL irregular layout (rows 9..357).
    # The others use 9..413. Stage 2 does not restructure.
    specs = {
        "FY 2023 (Jan23-Dec23)": fy_specs(413),
        "FY 2024 (Jan24-Dec24)": fy_specs(413),
        "FY 2025 (Jan25-Dec25)": fy_specs(413),
        "FY 2026 (Jan26-Dec26)": fy_specs(357),
        "FY 2027 (Jan27-Dec27)": fy_specs(413),
    }
    apply_dvs(SRC, specs)
    print("[stage1] re-injected x14 data validations")


if __name__ == "__main__":
    main()
