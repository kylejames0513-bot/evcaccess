"""
Stage 6 (surgical) -- Dashboard EVC label fix + Calibri 9 data font.

Addresses three items from the user's list:

  1. Dashboard EVC FY label "in a weird location". The original file
     places "EVC FISCAL YEAR:" at D5 but its value "FY EVC 2026" at
     G5, with two empty cells between them. Moving G5 would require
     updating 290+ formula references. Instead, move the label from
     D5 to F5 so it sits adjacent to the value. D5 becomes empty.

  2. "Calibri 9 everywhere besides headers". Rename every non-bold
     size-9 Arial font to Calibri in xl/styles.xml. The file has 9
     such fonts (different row-banding colors). Bold size-9 fonts
     are preserved because they're section headers or subtotals.
     No cellXf changes -- cells continue pointing at the same font
     indices.

  3. The HubSync.bas macro picks up a new PullHireDates sub in a
     separate edit (scripts/separation-summary/HubSync.bas) so HR
     can fill in missing Dates of Hire for historical rows by
     querying Supabase.

"Data needs to be better" (2a in the user's list) -- the structural
piece is the PullHireDates macro; the actual DoH pull happens when
the user runs the macro. No xlsx change is needed for it.

Row heights -- deliberately not touched (user confirmed 15pt is fine).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "FY Separation Summary.xlsx"

sys.path.insert(0, str(Path(__file__).parent))
from xlsx_patcher import XlsxPatcher  # noqa: E402


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")

    p = XlsxPatcher(SRC)

    # ------------------------------------------------------------------
    # 1. Dashboard: move "EVC FISCAL YEAR:" label from D5 to F5
    # ------------------------------------------------------------------
    p.set_string(
        "Dashboard",
        "F5",
        "EVC FISCAL YEAR:",
        copy_style_from="D5",
    )
    p.clear_cell("Dashboard", "D5")
    print("[stage6] Dashboard: moved EVC FISCAL YEAR label from D5 to F5")

    # ------------------------------------------------------------------
    # 2. Swap non-bold Arial 9 -> Calibri 9 in the fonts table
    # ------------------------------------------------------------------
    n = p.rename_font_by_size("9", "Calibri", only_non_bold=True)
    print(f"[stage6] renamed {n} non-bold size-9 fonts to Calibri")

    p.save()
    print(f"[stage6] wrote {SRC}")


if __name__ == "__main__":
    main()
