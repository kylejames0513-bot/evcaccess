"""
dv_fixup.py -- Re-inject x14 data validations into a saved xlsx.

Why this exists:
  openpyxl drops x14 extension data validations on save ("Data Validation
  extension is not supported and will be removed"). Our separation workbook
  needs range-referenced list validations (Reference!$A$2:$A$18 etc.) which
  only work as x14 extensions. So: edit the workbook with openpyxl, then
  run this post-processor to put the validations back.

Usage (as a library):
    from dv_fixup import DVSpec, apply_dvs
    specs = {
        "FY 2026 (Jan26-Dec26)": [
            DVSpec(formula="Reference!$G$2:$G$3", sqref="F9:F357",
                   error_title="Invalid Entry",
                   error="Please select a value from the list.",
                   style="stop"),
            ...
        ],
    }
    apply_dvs("/path/to/book.xlsx", specs)
"""
from __future__ import annotations

import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET


SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
X14_NS = "http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"
XM_NS = "http://schemas.microsoft.com/office/excel/2006/main"
MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"

# Register so ET emits our preferred prefixes.
ET.register_namespace("", SPREADSHEET_NS)
ET.register_namespace("r", REL_NS)
ET.register_namespace("x14", X14_NS)
ET.register_namespace("xm", XM_NS)
ET.register_namespace("mc", MC_NS)


@dataclass(frozen=True)
class DVSpec:
    formula: str            # e.g. "Reference!$G$2:$G$3"
    sqref: str              # e.g. "F9:F357" or "F9:F357 F400:F500"
    style: str = "stop"     # "stop" | "warning" | "information"
    error_title: str = "Invalid Entry"
    error: str = "Please select a value from the list."
    prompt_title: str = ""
    prompt: str = ""
    allow_blank: bool = True


def _uid(i: int, sheet_idx: int) -> str:
    return "{00000000-0002-0000-%04d-%08d}" % (sheet_idx, i)


def _build_x14_block(specs: list[DVSpec], sheet_idx: int) -> str:
    """Build the raw <ext>...</ext> block containing x14:dataValidations.
    Returned as a UTF-8 string ready to splice into the sheet xml."""
    parts = [
        '<ext xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" '
        'uri="{CCE6A557-97BC-4B89-ADB6-D9C93CAAB3DF}">'
        f'<x14:dataValidations count="{len(specs)}" '
        'xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">'
    ]
    for i, s in enumerate(specs):
        ab = "1" if s.allow_blank else "0"
        parts.append(
            f'<x14:dataValidation type="list" errorStyle="{s.style}" '
            f'allowBlank="{ab}" showInputMessage="1" showErrorMessage="1" '
            f'errorTitle="{s.error_title}" error="{s.error}" '
            f'promptTitle="{s.prompt_title}" prompt="{s.prompt}" '
            f'xr:uid="{_uid(i, sheet_idx)}" '
            'xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision">'
            f'<x14:formula1><xm:f>{s.formula}</xm:f></x14:formula1>'
            f'<xm:sqref>{s.sqref}</xm:sqref>'
            "</x14:dataValidation>"
        )
    parts.append("</x14:dataValidations></ext>")
    return "".join(parts)


def _sheet_name_to_xml_path(book_path: Path, sheet_name: str) -> str:
    """Resolve a display sheet name to its xl/worksheets/sheetN.xml path
    by walking workbook.xml + workbook.xml.rels."""
    with zipfile.ZipFile(book_path) as z:
        wb = z.read("xl/workbook.xml").decode("utf-8")
        rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    # sheet name -> r:id (attribute order is not guaranteed)
    m = None
    for sheet_el in re.finditer(r"<sheet\b[^>]*>", wb):
        el = sheet_el.group(0)
        name_m = re.search(r'\bname="([^"]*)"', el)
        rid_m = re.search(r'\br:id="([^"]+)"', el)
        if name_m and rid_m and name_m.group(1) == sheet_name:
            m = rid_m
            break
    if not m:
        raise KeyError(f"sheet {sheet_name!r} not found in workbook.xml")
    rid = m.group(1)
    # r:id -> target path (again, attribute order is not guaranteed)
    target = None
    for rel_el in re.finditer(r"<Relationship\b[^>]*>", rels):
        el = rel_el.group(0)
        id_m = re.search(r'\bId="([^"]+)"', el)
        tgt_m = re.search(r'\bTarget="([^"]+)"', el)
        if id_m and tgt_m and id_m.group(1) == rid:
            target = tgt_m.group(1)
            break
    if target is None:
        raise KeyError(f"relationship {rid} not found")
    if target.startswith("/"):
        return target.lstrip("/")
    return "xl/" + target.lstrip("./")


def _strip_existing_dvs(sheet_xml: str) -> str:
    """Remove any existing legacy <dataValidations> and extension-list
    x14 data validation <ext> elements. Leaves other <ext> entries alone."""
    # legacy block (any content up to close tag)
    sheet_xml = re.sub(
        r"<dataValidations\b[^>]*>.*?</dataValidations>",
        "",
        sheet_xml,
        flags=re.DOTALL,
    )
    # extension data validations block
    sheet_xml = re.sub(
        r'<ext\b[^>]*uri="\{CCE6A557-97BC-4B89-ADB6-D9C93CAAB3DF\}"[^>]*>.*?</ext>',
        "",
        sheet_xml,
        flags=re.DOTALL,
    )
    return sheet_xml


def _inject_dvs(sheet_xml: str, specs: list[DVSpec], sheet_idx: int) -> str:
    """Strip any prior DV blocks and splice in fresh ones."""
    xml = _strip_existing_dvs(sheet_xml)

    # Build the x14 ext block
    ext_xml = _build_x14_block(specs, sheet_idx)

    # Locate <extLst>...</extLst> — create it if missing.
    # It must live near the end of <worksheet>, after <tableParts>, after
    # <pageSetup>, etc. The safest insertion: just before </worksheet>,
    # wrapping in a new extLst if not present.
    if "<extLst>" in xml:
        xml = xml.replace("</extLst>", ext_xml + "</extLst>", 1)
    elif "<extLst/>" in xml:
        xml = xml.replace("<extLst/>", f"<extLst>{ext_xml}</extLst>", 1)
    else:
        xml = xml.replace(
            "</worksheet>",
            f"<extLst>{ext_xml}</extLst></worksheet>",
            1,
        )

    # Legacy inline dataValidations (for simple Yes/No etc.) get emitted
    # by callers if they need them via a separate DVSpec.legacy flag.
    return xml


def apply_dvs(
    book_path: str | Path,
    specs_by_sheet: dict[str, list[DVSpec]],
) -> None:
    """Rewrite sheets in-place to carry the given x14 data validations."""
    book_path = Path(book_path)
    # Resolve sheet names to paths up front (one zip open)
    sheet_paths: dict[str, str] = {}
    for name in specs_by_sheet:
        sheet_paths[name] = _sheet_name_to_xml_path(book_path, name)

    # Assign a stable sheet_idx (for uid uniqueness)
    idx_by_name = {name: i + 1 for i, name in enumerate(sorted(specs_by_sheet))}

    with tempfile.NamedTemporaryFile(
        suffix=".xlsx", delete=False, dir=str(book_path.parent)
    ) as tmp:
        tmp_path = Path(tmp.name)

    try:
        with zipfile.ZipFile(book_path) as zin:
            with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    data = zin.read(item.filename)
                    # find if this is a target sheet
                    target_name = None
                    for name, path in sheet_paths.items():
                        if item.filename == path:
                            target_name = name
                            break
                    if target_name is not None:
                        xml = data.decode("utf-8")
                        xml = _inject_dvs(
                            xml,
                            specs_by_sheet[target_name],
                            idx_by_name[target_name],
                        )
                        data = xml.encode("utf-8")
                    zout.writestr(item, data)
        shutil.move(str(tmp_path), str(book_path))
    finally:
        if tmp_path.exists():
            tmp_path.unlink()
