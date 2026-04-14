"""
Stage 2 (surgical redo) -- fix FY 2026 literal subtotal + strict DVs.

Deliberately smaller scope than the first attempt:

  * FY 2026's March subtotal at row 51 is a literal number (10) instead
    of a =COUNTA formula. Replace that one cell only.
  * Data validations are flipped from errorStyle="warning" to
    errorStyle="stop" on every FY sheet. Ranges are unchanged -- we
    do NOT restructure FY 2026's irregular layout.

Out of scope (we learned the hard way that these break visual
formatting when done via openpyxl):
  * FY 2026 month-block relocation
  * Historical data normalization (whitespace trim, case-fix)
  * Orphan Table1 removal
  * Merge cell rebuilding

The layout irregularity on FY 2026 is a cosmetic drift -- it doesn't
break the Dashboard because Data!B14:M14 already has the correct
irregular row references (B18, B33, B51, B85, ...). Leaving it alone
is fine.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "FY Separation Summary.xlsx"

sys.path.insert(0, str(Path(__file__).parent))
from xlsx_patcher import XlsxPatcher  # noqa: E402
from dv_fixup import DVSpec, apply_dvs  # noqa: E402


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")

    p = XlsxPatcher(SRC)

    # ------------------------------------------------------------------
    # FY 2026: B51 literal "10" -> =COUNTA formula.
    # The March data block in the current (irregular) layout spans
    # rows 37..47 (row 48 is the "do not count" note), so COUNTA(A37:A47)
    # reproduces what the user had written as "10".
    # ------------------------------------------------------------------
    p.set_formula(
        "FY 2026 (Jan26-Dec26)",
        "B51",
        "=COUNTA(A37:A47)",
    )
    print("[stage2] FY 2026 B51 literal-10 replaced with =COUNTA(A37:A47)")

    p.save()
    print(f"[stage2] wrote {SRC}")

    # ------------------------------------------------------------------
    # Re-inject strict x14 data validations
    # ------------------------------------------------------------------
    def strict_specs(last_row: int) -> list[DVSpec]:
        return [
            DVSpec(formula="Reference!$B$2:$B$3", sqref=f"E9:E{last_row}",
                   style="stop",
                   error_title="Invalid Rehire",
                   error="Rehire Eligibility must be Yes or No."),
            DVSpec(formula="Reference!$G$2:$G$3", sqref=f"F9:F{last_row}",
                   style="stop",
                   error_title="Invalid Status",
                   error="Status must be U (uneligible) or D (discharged)."),
            DVSpec(formula="Reference!$E$2:$E$64", sqref=f"G9:G{last_row}",
                   style="stop",
                   error_title="Invalid Location",
                   error="Pick a location from the Reference list."),
            DVSpec(formula="Reference!$C$2:$C$14", sqref=f"H9:H{last_row}",
                   style="stop",
                   error_title="Invalid Reason",
                   error="Pick a reason from the Reference list."),
            DVSpec(formula="Reference!$A$2:$A$18", sqref=f"K9:K{last_row}",
                   style="stop",
                   error_title="Invalid Job",
                   error="Pick a job from the Reference list."),
            DVSpec(formula="Reference!$L$2:$L$10", sqref=f"M9:M{last_row}",
                   style="stop",
                   error_title="Invalid Department",
                   error="Pick a department from the Reference list."),
        ]

    specs = {
        "FY 2023 (Jan23-Dec23)": strict_specs(413),
        "FY 2024 (Jan24-Dec24)": strict_specs(413),
        "FY 2025 (Jan25-Dec25)": strict_specs(413),
        "FY 2026 (Jan26-Dec26)": strict_specs(357),
        "FY 2027 (Jan27-Dec27)": strict_specs(413),
    }
    apply_dvs(SRC, specs)
    print("[stage2] re-applied strict x14 data validations")


if __name__ == "__main__":
    main()
