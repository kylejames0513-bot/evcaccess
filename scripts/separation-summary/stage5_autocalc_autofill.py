"""
Stage 5 (surgical) -- auto calc + autofill formulas on empty data rows.

Two safe improvements:

  1. workbook.xml calcPr gets calcMode="auto" and fullCalcOnLoad="1".
     Excel will recompute every formula on open instead of relying on
     possibly-stale cached values.

  2. Every EMPTY data cell in columns D (Length of Service) and M
     (Department) on every FY sheet gets a formula written into it.
     When HR types a Date of Hire + Date of Separation into a new row,
     Length of Service computes automatically via DATEDIF. When they
     pick a Location from the dropdown, Department fills in via
     VLOOKUP against the Reference mapping.

     Critically: we only write into cells that currently have NO
     content. Hand-typed historical LoS strings on FY 2023/2024/2025
     (like "9 years 11 months") are preserved untouched.

Out of scope (deferred pending user specifics):
  * Dashboard EVC FY header styling ("formatted better")
  * Font unification across data rows
  * Row-height normalization (data rows are already uniformly 15pt)
  * Any "data needs to be better" changes
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "FY Separation Summary.xlsx"

sys.path.insert(0, str(Path(__file__).parent))
from xlsx_patcher import XlsxPatcher  # noqa: E402


# ------------------------------------------------------------------
# Data row ranges per FY sheet
# ------------------------------------------------------------------
# Standard layout: 12 month blocks of 30 data rows starting at row 9,
# 43, 77, 111, ..., 383. Month header row + col header row + 30 data
# rows + subtotal row + blank spacer = 34 rows per block.
def standard_data_rows() -> list[int]:
    rows: list[int] = []
    for block in range(12):
        start = 9 + block * 34
        rows.extend(range(start, start + 30))
    return rows


# FY 2026 uses the irregular layout from the original file. These
# ranges are the actual data areas that currently exist on the sheet.
FY_2026_DATA_ROWS: list[int] = (
    list(range(9, 18))      # January  rows  9-17
    + list(range(22, 33))    # February rows 22-32
    + list(range(37, 48))    # March    rows 37-47 (48 is the
                             #           "do not count" note, skip)
    + list(range(55, 85))    # April    rows 55-84
    + list(range(89, 119))   # May      rows 89-118
    + list(range(123, 153))  # June     rows 123-152
    + list(range(157, 187))  # July     rows 157-186
    + list(range(191, 221))  # August   rows 191-220
    + list(range(225, 255))  # Sep      rows 225-254
    + list(range(259, 289))  # Oct      rows 259-288
    + list(range(293, 323))  # Nov      rows 293-322
    + list(range(327, 357))  # Dec      rows 327-356
)


def los_formula(row: int) -> str:
    """DATEDIF-based length-of-service expression. Returns "" if
    either Date of Hire (col C) or Date of Separation (col B) is
    blank. Copied verbatim from the formula already on the populated
    FY 2026 rows so the rendered format is consistent."""
    b, c = f"B{row}", f"C{row}"
    return (
        f'=IF(OR({b}="",{c}=""),"",'
        f'IF(DATEDIF({c},{b},"y")>=1,'
        f'DATEDIF({c},{b},"y")&IF(DATEDIF({c},{b},"y")=1," year "," years ")&'
        f'DATEDIF({c},{b},"ym")&IF(DATEDIF({c},{b},"ym")=1," month"," months"),'
        f'IF(DATEDIF({c},{b},"m")>=1,'
        f'DATEDIF({c},{b},"m")&IF(DATEDIF({c},{b},"m")=1," month"," months"),'
        f'DATEDIF({c},{b},"d")&IF(DATEDIF({c},{b},"d")=1," day"," days"))))'
    )


def dept_formula(row: int) -> str:
    """Location -> Department lookup. Matches what already exists on
    the populated FY 2026 rows."""
    return (
        f'=IFERROR(VLOOKUP(G{row},Reference!$I$2:$J$175,2,FALSE),"Operations")'
    )


FY_SHEETS = [
    ("FY 2023 (Jan23-Dec23)", "standard"),
    ("FY 2024 (Jan24-Dec24)", "standard"),
    ("FY 2025 (Jan25-Dec25)", "standard"),
    ("FY 2026 (Jan26-Dec26)", "fy2026"),
    ("FY 2027 (Jan27-Dec27)", "standard"),
]


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")

    p = XlsxPatcher(SRC)

    # ------------------------------------------------------------------
    # 1. Auto calc + full recalc on load
    # ------------------------------------------------------------------
    p.set_auto_calc()
    print("[stage5] workbook calcPr: calcMode=auto fullCalcOnLoad=1")

    # ------------------------------------------------------------------
    # 2. Autofill formulas on empty data rows
    # ------------------------------------------------------------------
    los_written = {name: 0 for name, _ in FY_SHEETS}
    dept_written = {name: 0 for name, _ in FY_SHEETS}

    for sheet_name, layout in FY_SHEETS:
        data_rows = (
            FY_2026_DATA_ROWS if layout == "fy2026" else standard_data_rows()
        )
        for r in data_rows:
            d_ref = f"D{r}"
            m_ref = f"M{r}"
            if not p.has_content(sheet_name, d_ref):
                p.set_formula(sheet_name, d_ref, los_formula(r))
                los_written[sheet_name] += 1
            if not p.has_content(sheet_name, m_ref):
                p.set_formula(sheet_name, m_ref, dept_formula(r))
                dept_written[sheet_name] += 1

    for name, _ in FY_SHEETS:
        print(
            f"[stage5] {name}: LoS formulas added = {los_written[name]}, "
            f"Dept formulas added = {dept_written[name]}"
        )

    p.save()
    print(f"[stage5] wrote {SRC}")


if __name__ == "__main__":
    main()
