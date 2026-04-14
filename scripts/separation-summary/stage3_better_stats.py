"""
Stage 3 (surgical redo) -- better statistics.

Every change is via XlsxPatcher so the file stays byte-identical
outside the specific cells we touch. Reference and Data are both
hidden sheets so cosmetic styling on them is low stakes; all
visible-sheet touches are write-to-empty-cell (with style copied
from a donor) so the Dashboard never sees a style drift.

Changes:

  Reference (hidden sheet):
    N1..N6 = "FY", "FY 2023", .. "FY 2027"
    O1..O6 = "Active Emp (FY start)", 339, 339, 346, 366, 364

  Data (hidden sheet):
    B2..B6 -> VLOOKUP Reference!$N$2:$O$6
               (centralized Active Employee count)
    E2..E6 -> months-elapsed average instead of months-with-data
    F2..F6 -> SUMPRODUCT over reason category = "Voluntary"
    G2..G6 -> SUMPRODUCT over reason category = "Involuntary"
    H2..H6 -> SUMPRODUCT over reason category = "Other"
    B56..B68 -> VLOOKUP Reference!$C$2:$D$14 for Category
                (pulls category from the single source of truth
                instead of hand-typing it here)
    A68 "Resignation without Notice" + C68..G68 per-FY COUNTIFs
    new row so the vol/invol rollup picks up the new reason.

  Dashboard (visible sheet):
    A50, C50 = "Rolling 12-month Turnover:" + formula
    A51, C51 = "Avg Tenure at Separation:"  + formula
    These rows were empty in columns A..C on the original file
    (only G-J had content from the job breakdown on the right).
    Both cells copy style from A48/C48 (the existing "Eligible for
    Rehire Rate:" row) so they render identically.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "FY Separation Summary.xlsx"

sys.path.insert(0, str(Path(__file__).parent))
from xlsx_patcher import XlsxPatcher  # noqa: E402

FY_SHEETS: list[tuple[str, str]] = [
    ("FY 2023", "FY 2023 (Jan23-Dec23)"),
    ("FY 2024", "FY 2024 (Jan24-Dec24)"),
    ("FY 2025", "FY 2025 (Jan25-Dec25)"),
    ("FY 2026", "FY 2026 (Jan26-Dec26)"),
    ("FY 2027", "FY 2027 (Jan27-Dec27)"),
]

ACTIVE_EMPLOYEES: list[tuple[str, int]] = [
    ("FY 2023", 339),
    ("FY 2024", 339),
    ("FY 2025", 346),
    ("FY 2026", 366),
    ("FY 2027", 364),
]

# The reasons table at Data!A56..A67 in the original file, plus the
# new row 68 we're adding for "Resignation without Notice". Both the
# existing and new rows get their B column rewritten as VLOOKUP.
DATA_REASON_ROWS = list(range(56, 69))  # 56..68 inclusive

# Reasons whose row 68 is new. A68..G68 are currently empty (the
# original reason table ends at row 67). We add the row in full.
NEW_REASON_ROW = 68
NEW_REASON_LABEL = "Resignation without Notice"


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")

    p = XlsxPatcher(SRC)

    # ------------------------------------------------------------------
    # Reference!N:O -- active employees by FY
    # ------------------------------------------------------------------
    p.set_string("Reference", "N1", "FY", copy_style_from="A1")
    p.set_string("Reference", "O1", "Active Emp (FY start)", copy_style_from="A1")
    for i, (fy, count) in enumerate(ACTIVE_EMPLOYEES):
        row = 2 + i
        p.set_string("Reference", f"N{row}", fy, copy_style_from="A2")
        p.set_number("Reference", f"O{row}", count, copy_style_from="A2")
    print("[stage3] Reference!N1:O6 populated")

    # ------------------------------------------------------------------
    # Data!B2:B6 -- Active Employees via VLOOKUP
    # ------------------------------------------------------------------
    # Formerly pointed at 'FY XXXX'!B5 which was a hard-coded integer.
    for i, (fy, _) in enumerate(FY_SHEETS):
        row = 2 + i
        p.set_formula(
            "Data", f"B{row}",
            f'=IFERROR(VLOOKUP("{fy}",Reference!$N$2:$O$6,2,FALSE),0)',
        )
    print("[stage3] Data!B2:B6 rewritten as VLOOKUP into Reference!N:O")

    # ------------------------------------------------------------------
    # Data!E2:E6 -- Avg Monthly Separations (months-elapsed)
    # ------------------------------------------------------------------
    # Old formula divided by months-with-data (COUNTIF(">0")), which
    # hid slow months. New formula divides by months elapsed:
    #   * 12 for completed years
    #   * MONTH(TODAY()) for the in-progress year
    #   * NA() for future years
    for i in range(5):
        row = 2 + i
        p.set_formula(
            "Data", f"E{row}",
            f"=IFERROR(C{row}/IF(VALUE(RIGHT(A{row},4))<YEAR(TODAY()),12,"
            f"IF(VALUE(RIGHT(A{row},4))>YEAR(TODAY()),NA(),MONTH(TODAY()))),0)",
        )
    print("[stage3] Data!E2:E6 avg monthly now uses months-elapsed")

    # ------------------------------------------------------------------
    # Data!F2:H6 -- Vol / Invol / Other via SUMPRODUCT
    # ------------------------------------------------------------------
    # Old formula was a hand-wired COUNTIF chain over specific reason
    # strings. New formula loops over the Data reason table (now with
    # Resignation without Notice included at row 68) filtered by the
    # B column category.
    for i in range(5):
        row = 2 + i
        reason_col = chr(ord("C") + i)  # C..G -- per-FY counts table
        p.set_formula(
            "Data", f"F{row}",
            f'=SUMPRODUCT((Data!$B$56:$B$68="Voluntary")'
            f'*Data!${reason_col}$56:${reason_col}$68)',
        )
        p.set_formula(
            "Data", f"G{row}",
            f'=SUMPRODUCT((Data!$B$56:$B$68="Involuntary")'
            f'*Data!${reason_col}$56:${reason_col}$68)',
        )
        p.set_formula(
            "Data", f"H{row}",
            f'=SUMPRODUCT((Data!$B$56:$B$68="Other")'
            f'*Data!${reason_col}$56:${reason_col}$68)',
        )
    print("[stage3] Data!F2:H6 rewritten as category SUMPRODUCT")

    # ------------------------------------------------------------------
    # Data!A68 + C68..G68 -- new reason row
    # ------------------------------------------------------------------
    p.set_string("Data", f"A{NEW_REASON_ROW}", NEW_REASON_LABEL)
    for i, (_, sheet_name) in enumerate(FY_SHEETS):
        col = chr(ord("C") + i)  # C..G
        p.set_formula(
            "Data", f"{col}{NEW_REASON_ROW}",
            f"=COUNTIF('{sheet_name}'!H9:H412,\"{NEW_REASON_LABEL}\")",
        )
    print(f"[stage3] Data row {NEW_REASON_ROW} added for '{NEW_REASON_LABEL}'")

    # ------------------------------------------------------------------
    # Data!B56:B68 -- category column pulled from Reference!C:D
    # ------------------------------------------------------------------
    # Before: hand-typed "Voluntary"/"Involuntary"/"Other" that had
    # drifted from the canonical list (Attendance Issues / Job
    # Abandonment / Performance Issues were "Other" here but
    # "Involuntary" in the new Reference!D). Routing through the
    # Reference means the category is defined in exactly one place.
    for r in DATA_REASON_ROWS:
        p.set_formula(
            "Data", f"B{r}",
            f'=IFERROR(VLOOKUP(A{r},Reference!$C$2:$D$14,2,FALSE),"Other")',
        )
    print("[stage3] Data!B56:B68 rewritten as Reference!C:D VLOOKUP")

    # ------------------------------------------------------------------
    # Dashboard rows 50, 51 -- new stats in empty cells
    # ------------------------------------------------------------------
    # Column A is empty for these rows (right-side job breakdown lives
    # on cols G..J). Copy style from A48 so the labels render the
    # same as the existing "Eligible for Rehire Rate:" row.
    p.set_string(
        "Dashboard", "A50",
        "Rolling 12-month Turnover:",
        copy_style_from="A48",
    )
    # Rolling 12-month = separations in last 365 days across every FY,
    # divided by the currently-selected FY's active headcount.
    fy_terms = []
    for _, sheet_name in FY_SHEETS:
        fy_terms.append(
            f"SUMPRODUCT((ISNUMBER('{sheet_name}'!$B$9:$B$412))"
            f"*(('{sheet_name}'!$B$9:$B$412>=TODAY()-365)"
            f"*('{sheet_name}'!$B$9:$B$412<=TODAY())))"
        )
    sum_expr = "+".join(fy_terms)
    p.set_formula(
        "Dashboard", "C50",
        f"=IFERROR(({sum_expr})/VLOOKUP($B$5,Data!$A$2:$K$6,2,FALSE),0)",
        copy_style_from="C48",
    )

    p.set_string(
        "Dashboard", "A51",
        "Avg Tenure at Separation:",
        copy_style_from="A48",
    )
    # For the selected FY, averages (DateOfSeparation - DateOfHire) in
    # years across every row with both dates. FY 2026 is the first
    # year with DoH so returns "N/A" for older years.
    sheet_b = (
        'INDIRECT("\'"&$B$5&" (Jan"&RIGHT($B$5,2)'
        '&"-Dec"&RIGHT($B$5,2)&")\'!B9:B412")'
    )
    sheet_c = (
        'INDIRECT("\'"&$B$5&" (Jan"&RIGHT($B$5,2)'
        '&"-Dec"&RIGHT($B$5,2)&")\'!C9:C412")'
    )
    count_expr = f'SUMPRODUCT(({sheet_b}<>"")*({sheet_c}<>""))'
    avg_expr = (
        f'SUMPRODUCT(({sheet_b}<>"")*({sheet_c}<>"")*({sheet_b}-{sheet_c}))'
    )
    p.set_formula(
        "Dashboard", "C51",
        f'=IFERROR(IF({count_expr}=0,"N/A (no DOH data)",'
        f'({avg_expr})/{count_expr}/365.25),"N/A (no DOH data)")',
        copy_style_from="C48",
    )
    print("[stage3] Dashboard rows 50-51 added (Rolling 12mo TOR, Avg Tenure)")

    p.save()
    print(f"[stage3] wrote {SRC}")


if __name__ == "__main__":
    main()
