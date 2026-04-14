"""
Stage 7 (surgical) -- Calibri 9 on blank data cells.

Stage 6 renamed non-bold Arial 9 font entries to Calibri, which fixed
the roughly 550 FY-sheet data cells that already referenced one of
those fonts. The remaining ~4,200+ placeholder / banding / border
cells in the data area point at cellXfs that reference fontId=0
(Calibri 11). When HR types into one of those cells, text renders
at 11pt instead of 9pt.

The fix: clone every cellXf that uses fontId=0 (there are 18 such)
with fontId swapped to fontId=2 (the existing Calibri 9 font), then
on every FY sheet -- and ONLY the FY sheets -- remap any cell
currently pointing at an original cellXf to the cloned version.

Dashboard, Data, Reference, and Multi-Year Analytics cells that
reference the same cellXfs are deliberately untouched, so 11pt
Calibri text on the Dashboard stays 11pt.

Row range for the remap: rows 7..413 inclusive on every FY sheet.
This covers month header rows, column header rows, data rows,
subtotals, and spacers. The remap only fires when a cell's current
`s` is in the mapping -- header cells use bold / larger fonts that
are NOT in the font-0 list, so they pass through unchanged.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "FY Separation Summary.xlsx"

sys.path.insert(0, str(Path(__file__).parent))
from xlsx_patcher import XlsxPatcher  # noqa: E402

FY_SHEETS = [
    "FY 2023 (Jan23-Dec23)",
    "FY 2024 (Jan24-Dec24)",
    "FY 2025 (Jan25-Dec25)",
    "FY 2026 (Jan26-Dec26)",
    "FY 2027 (Jan27-Dec27)",
]

# Font 2 in styles.xml is already the existing Calibri 9 definition.
# Font 0 is the problematic Calibri 11 default.
FONT_CALIBRI_11 = 0
FONT_CALIBRI_9 = 2


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")

    p = XlsxPatcher(SRC)

    # 1. Clone every cellXf that uses font 0 (Calibri 11) with a new
    #    cellXf that uses font 2 (Calibri 9).
    mapping = p.clone_cellxfs_with_font_swap(
        FONT_CALIBRI_11, FONT_CALIBRI_9
    )
    print(
        f"[stage7] cloned {len(mapping)} cellXfs (font 0 -> font 2); "
        f"new indices: {sorted(mapping.values())}"
    )

    # 2. Remap cell styles on every FY sheet in the data rows.
    total = 0
    for name in FY_SHEETS:
        n = p.remap_cell_styles(
            name, mapping, row_range=range(7, 414)
        )
        print(f"[stage7] {name}: {n} cells remapped to Calibri 9")
        total += n
    print(f"[stage7] total cells remapped: {total}")

    p.save()
    print(f"[stage7] wrote {SRC}")


if __name__ == "__main__":
    main()
