"""
XlsxPatcher -- surgical XML-level xlsx editing.

The Separation Summary workbook is full of customXml, calcChain, shared
strings, and metadata that openpyxl drops on round-trip. Loading through
openpyxl and saving -- even with zero edits -- throws away 11 files and
damages visual formatting.

This module edits an xlsx in place without ever going through openpyxl:

    p = XlsxPatcher("file.xlsx")
    p.set_formula("FY 2026 (Jan26-Dec26)", "B51", "=COUNTA(A37:A47)")
    p.set_string("Reference", "B1", "Rehire Eligibility")
    p.save()

Every byte outside the cells we touch is preserved byte-identical, which
means the rendered file stays visually identical to the original.

Design:
  * Load all zip entries into memory as raw bytes.
  * For sheets we edit, parse their XML with lxml, mutate the cell
    elements in place, serialize back. All other entries stay bytes.
  * Inline strings (<c t="inlineStr"><is><t>...</t></is></c>) are used
    for new string cells so we never have to touch sharedStrings.xml.
  * Cell style indices (the `s="N"` attribute) are preserved. If we
    write into an empty cell, we can optionally copy the style from an
    adjacent cell so new headers match existing headers.
"""
from __future__ import annotations

import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

from lxml import etree as ET

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NSMAP = {"s": NS}


def _qn(tag: str) -> str:
    """Qualified name in the spreadsheetml namespace."""
    return "{" + NS + "}" + tag


def _col_letter_to_num(letters: str) -> int:
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch.upper()) - ord("A") + 1)
    return n


def _col_num_to_letter(n: int) -> str:
    s = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        s = chr(ord("A") + rem) + s
    return s


_CELL_RE = re.compile(r"^([A-Z]+)(\d+)$")


def _parse_ref(ref: str) -> tuple[int, int, str]:
    m = _CELL_RE.match(ref.upper())
    if not m:
        raise ValueError(f"bad cell ref: {ref!r}")
    col_letters, row_str = m.group(1), m.group(2)
    return int(row_str), _col_letter_to_num(col_letters), col_letters


class XlsxPatcher:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._files: dict[str, bytes] = {}
        self._trees: dict[str, ET._Element] = {}
        self._sheet_name_to_path: dict[str, str] = {}
        self._load()

    # ------------------------------------------------------------------
    # Loading / saving
    # ------------------------------------------------------------------
    def _load(self) -> None:
        with zipfile.ZipFile(self.path) as z:
            for name in z.namelist():
                self._files[name] = z.read(name)
        # Map sheet display name -> xl/worksheets/sheetN.xml
        wb_xml = self._files["xl/workbook.xml"].decode("utf-8")
        rels_xml = self._files["xl/_rels/workbook.xml.rels"].decode("utf-8")
        sheets: list[tuple[str, str]] = []
        for m in re.finditer(r"<sheet\b[^>]*>", wb_xml):
            el = m.group(0)
            nm = re.search(r'\bname="([^"]*)"', el)
            rid = re.search(r'\br:id="([^"]+)"', el)
            if nm and rid:
                sheets.append((nm.group(1), rid.group(1)))
        rel_map: dict[str, str] = {}
        for m in re.finditer(r"<Relationship\b[^>]*>", rels_xml):
            el = m.group(0)
            rid = re.search(r'\bId="([^"]+)"', el)
            tgt = re.search(r'\bTarget="([^"]+)"', el)
            if rid and tgt:
                target = tgt.group(1)
                if target.startswith("/"):
                    rel_map[rid.group(1)] = target.lstrip("/")
                else:
                    rel_map[rid.group(1)] = "xl/" + target.lstrip("./")
        for name, rid in sheets:
            if rid in rel_map:
                self._sheet_name_to_path[name] = rel_map[rid]

    def save(self, dst: Optional[str | Path] = None) -> None:
        # Serialize any dirty trees
        for path, tree in self._trees.items():
            xml = ET.tostring(
                tree,
                xml_declaration=True,
                encoding="UTF-8",
                standalone=True,
            )
            self._files[path] = xml
        dst_path = Path(dst) if dst else self.path
        with tempfile.NamedTemporaryFile(
            suffix=".xlsx", delete=False, dir=str(dst_path.parent)
        ) as tmp:
            tmp_path = Path(tmp.name)
        try:
            with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as z:
                # Preserve original order of entries in the zip
                with zipfile.ZipFile(self.path) as zin:
                    for item in zin.infolist():
                        z.writestr(item, self._files[item.filename])
                # Any NEW files added that weren't in the original
                original_names = {i.filename for i in zipfile.ZipFile(self.path).infolist()}
                for name, data in self._files.items():
                    if name not in original_names:
                        z.writestr(name, data)
            shutil.move(str(tmp_path), str(dst_path))
        finally:
            if tmp_path.exists():
                tmp_path.unlink()

    # ------------------------------------------------------------------
    # Sheet XML access
    # ------------------------------------------------------------------
    def _sheet_path(self, sheet_name: str) -> str:
        try:
            return self._sheet_name_to_path[sheet_name]
        except KeyError:
            raise KeyError(f"sheet {sheet_name!r} not found")

    def _get_tree(self, path: str) -> ET._Element:
        if path not in self._trees:
            self._trees[path] = ET.fromstring(self._files[path])
        return self._trees[path]

    def _get_sheet_tree(self, sheet_name: str) -> ET._Element:
        return self._get_tree(self._sheet_path(sheet_name))

    # ------------------------------------------------------------------
    # Row / cell helpers
    # ------------------------------------------------------------------
    def _find_row(self, sheet: ET._Element, row_num: int) -> Optional[ET._Element]:
        sd = sheet.find(_qn("sheetData"))
        if sd is None:
            return None
        return sd.find(f'{_qn("row")}[@r="{row_num}"]')

    def _get_or_create_row(self, sheet: ET._Element, row_num: int) -> ET._Element:
        sd = sheet.find(_qn("sheetData"))
        if sd is None:
            raise RuntimeError("sheet has no sheetData")
        row = sd.find(f'{_qn("row")}[@r="{row_num}"]')
        if row is not None:
            return row
        # Insert new row in the right numeric position
        row = ET.Element(_qn("row"), r=str(row_num))
        inserted = False
        for i, existing in enumerate(list(sd)):
            existing_r = int(existing.get("r", "0"))
            if existing_r > row_num:
                sd.insert(i, row)
                inserted = True
                break
        if not inserted:
            sd.append(row)
        return row

    def _find_cell(self, row: ET._Element, cell_ref: str) -> Optional[ET._Element]:
        return row.find(f'{_qn("c")}[@r="{cell_ref}"]')

    def _get_or_create_cell(
        self, row: ET._Element, cell_ref: str, col_num: int
    ) -> ET._Element:
        existing = self._find_cell(row, cell_ref)
        if existing is not None:
            return existing
        # Insert new cell at the correct position (sorted by column number)
        new_cell = ET.Element(_qn("c"), r=cell_ref)
        inserted = False
        for i, c in enumerate(list(row.findall(_qn("c")))):
            c_ref = c.get("r", "")
            m = _CELL_RE.match(c_ref)
            if m and _col_letter_to_num(m.group(1)) > col_num:
                row.insert(i, new_cell)
                inserted = True
                break
        if not inserted:
            row.append(new_cell)
        return new_cell

    # ------------------------------------------------------------------
    # Public edit API
    # ------------------------------------------------------------------
    def set_formula(
        self,
        sheet_name: str,
        cell_ref: str,
        formula: str,
        copy_style_from: Optional[str] = None,
    ) -> None:
        """Write a formula to a cell. Preserves existing style index
        unless copy_style_from is set, in which case the donor cell's
        style overrides. Strips any cached value so Excel recomputes
        on open."""
        formula = formula.lstrip("=")
        row_num, col_num, _ = _parse_ref(cell_ref)
        sheet = self._get_sheet_tree(sheet_name)
        row = self._get_or_create_row(sheet, row_num)
        cell = self._get_or_create_cell(row, cell_ref, col_num)

        # Strip existing children (old value, old formula)
        for child in list(cell):
            cell.remove(child)

        # Formula cells have no t attribute
        if "t" in cell.attrib:
            del cell.attrib["t"]

        # Copy style from a neighbor if requested. This overrides any
        # placeholder style the cell already has -- placeholder empty
        # cells in the original xlsx often sit at a light "column
        # spacer" style that looks wrong for actual content.
        if copy_style_from:
            donor = self._get_cell(sheet_name, copy_style_from)
            if donor is not None and donor.get("s"):
                cell.set("s", donor.get("s"))

        f = ET.SubElement(cell, _qn("f"))
        f.text = formula

    def set_string(
        self,
        sheet_name: str,
        cell_ref: str,
        value: str,
        copy_style_from: Optional[str] = None,
    ) -> None:
        """Write an inline string to a cell. If copy_style_from is
        set, the donor cell's style overrides whatever is already on
        the target -- needed to replace placeholder spacer styles on
        empty cells."""
        row_num, col_num, _ = _parse_ref(cell_ref)
        sheet = self._get_sheet_tree(sheet_name)
        row = self._get_or_create_row(sheet, row_num)
        cell = self._get_or_create_cell(row, cell_ref, col_num)

        for child in list(cell):
            cell.remove(child)

        cell.set("t", "inlineStr")

        if copy_style_from:
            donor = self._get_cell(sheet_name, copy_style_from)
            if donor is not None and donor.get("s"):
                cell.set("s", donor.get("s"))

        is_el = ET.SubElement(cell, _qn("is"))
        t_el = ET.SubElement(is_el, _qn("t"))
        t_el.text = value
        # Preserve whitespace
        t_el.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")

    def set_number(
        self,
        sheet_name: str,
        cell_ref: str,
        value: float | int,
        copy_style_from: Optional[str] = None,
    ) -> None:
        row_num, col_num, _ = _parse_ref(cell_ref)
        sheet = self._get_sheet_tree(sheet_name)
        row = self._get_or_create_row(sheet, row_num)
        cell = self._get_or_create_cell(row, cell_ref, col_num)

        for child in list(cell):
            cell.remove(child)

        if "t" in cell.attrib:
            del cell.attrib["t"]

        if copy_style_from:
            donor = self._get_cell(sheet_name, copy_style_from)
            if donor is not None and donor.get("s"):
                cell.set("s", donor.get("s"))

        v = ET.SubElement(cell, _qn("v"))
        v.text = str(value)

    def _get_cell(
        self, sheet_name: str, cell_ref: str
    ) -> Optional[ET._Element]:
        row_num, _, _ = _parse_ref(cell_ref)
        sheet = self._get_sheet_tree(sheet_name)
        row = self._find_row(sheet, row_num)
        if row is None:
            return None
        return self._find_cell(row, cell_ref)

    def get_cell_raw(self, sheet_name: str, cell_ref: str) -> Optional[str]:
        """Return raw xml of a cell, for debugging."""
        c = self._get_cell(sheet_name, cell_ref)
        if c is None:
            return None
        return ET.tostring(c, pretty_print=False).decode()

    def clear_cell(self, sheet_name: str, cell_ref: str) -> None:
        """Remove value/formula content from a cell while keeping its
        style and existence. After this, Excel renders the cell as
        empty but the `s` index and layout position are preserved."""
        cell = self._get_cell(sheet_name, cell_ref)
        if cell is None:
            return
        for child in list(cell):
            cell.remove(child)
        if "t" in cell.attrib:
            del cell.attrib["t"]

    def has_content(self, sheet_name: str, cell_ref: str) -> bool:
        """True if a cell exists AND has a value, formula, or inline
        string child. Used by stages that only want to write into
        empty cells so hand-typed historical data is not clobbered."""
        cell = self._get_cell(sheet_name, cell_ref)
        if cell is None:
            return False
        for child in cell:
            tag = child.tag.split("}")[-1]
            if tag in ("v", "f", "is"):
                return True
        return False

    # ------------------------------------------------------------------
    # Workbook-level settings
    # ------------------------------------------------------------------
    def rename_font_by_size(
        self,
        target_size: str,
        new_name: str,
        only_non_bold: bool = True,
    ) -> int:
        """Rename every font entry of `target_size` to `new_name`.

        With only_non_bold=True (the default), bold fonts are left
        alone because they're almost always section headers or
        subtotals, and the user's directive is "calibri 9 everywhere
        besides headers". Returns the count of fonts renamed.

        Operates directly on xl/styles.xml -- no cellXf changes
        needed, since cells continue to reference the same fontId
        indices but the underlying font definition is updated."""
        styles = self._files["xl/styles.xml"].decode("utf-8")
        changed = 0
        size_tag = f'<sz val="{target_size}"/>'

        def repl(match: re.Match) -> str:
            nonlocal changed
            block = match.group(0)
            if size_tag not in block:
                return block
            if only_non_bold and "<b/>" in block:
                return block
            new_block, n = re.subn(
                r'<name val="[^"]*"/>',
                f'<name val="{new_name}"/>',
                block,
                count=1,
            )
            if n:
                changed += 1
                return new_block
            return block

        styles = re.sub(r"<font>.*?</font>", repl, styles, flags=re.DOTALL)
        self._files["xl/styles.xml"] = styles.encode("utf-8")
        return changed

    def clone_cellxfs_with_font_swap(
        self,
        from_font_id: int,
        to_font_id: int,
    ) -> dict[int, int]:
        """For every cellXf that references `from_font_id`, append a
        clone with fontId swapped to `to_font_id`. Returns the
        mapping {old_cellxf_index: new_cellxf_index}.

        Uses lxml to parse xl/styles.xml correctly: cellXfs contain
        both self-closing `<xf .../>` and paired `<xf ...><alignment/>
        </xf>` entries with child alignment/protection elements.
        A regex-only approach was attempted first and blew up because
        `[^/]*` inside an xf opening tag chews through the alignment
        child, leaving an orphan `</xf>`."""
        styles_xml = self._files["xl/styles.xml"]
        tree = ET.fromstring(styles_xml)

        # styles.xml is in the same spreadsheetml namespace as sheets
        cellxfs = tree.find(_qn("cellXfs"))
        if cellxfs is None:
            return {}

        xf_children = cellxfs.findall(_qn("xf"))
        mapping: dict[int, int] = {}
        new_xfs: list[ET._Element] = []
        base_count = len(xf_children)

        for i, xf in enumerate(xf_children):
            if xf.get("fontId") == str(from_font_id):
                clone = ET.fromstring(ET.tostring(xf))
                clone.set("fontId", str(to_font_id))
                # Ensure applyFont="1" so the new font is actually used.
                clone.set("applyFont", "1")
                mapping[i] = base_count + len(new_xfs)
                new_xfs.append(clone)

        if not new_xfs:
            return mapping

        for clone in new_xfs:
            cellxfs.append(clone)
        cellxfs.set("count", str(base_count + len(new_xfs)))

        serialized = ET.tostring(
            tree,
            xml_declaration=True,
            encoding="UTF-8",
            standalone=True,
        )
        self._files["xl/styles.xml"] = serialized
        return mapping

    def remap_cell_styles(
        self,
        sheet_name: str,
        style_map: dict[int, int],
        row_range: Optional[range] = None,
        min_col: int = 1,
        max_col: int = 16384,
    ) -> int:
        """On the given sheet, for every cell whose row is in
        `row_range` and whose `s` attribute is a key in `style_map`,
        replace the style index with the mapped value. Returns count
        of cells changed."""
        if not style_map:
            return 0
        sheet = self._get_sheet_tree(sheet_name)
        sd = sheet.find(_qn("sheetData"))
        if sd is None:
            return 0
        changed = 0
        for row in sd.findall(_qn("row")):
            rn = int(row.get("r", "0"))
            if row_range is not None and rn not in row_range:
                continue
            for cell in row.findall(_qn("c")):
                s = cell.get("s")
                if s is None:
                    continue
                s_int = int(s)
                if s_int not in style_map:
                    continue
                ref = cell.get("r", "")
                m = _CELL_RE.match(ref)
                if not m:
                    continue
                col_num = _col_letter_to_num(m.group(1))
                if not (min_col <= col_num <= max_col):
                    continue
                cell.set("s", str(style_map[s_int]))
                changed += 1
        return changed
        styles = self._files["xl/styles.xml"].decode("utf-8")
        changed = 0
        size_tag = f'<sz val="{target_size}"/>'

        def repl(match: re.Match) -> str:
            nonlocal changed
            block = match.group(0)
            if size_tag not in block:
                return block
            if only_non_bold and "<b/>" in block:
                return block
            new_block, n = re.subn(
                r'<name val="[^"]*"/>',
                f'<name val="{new_name}"/>',
                block,
                count=1,
            )
            if n:
                changed += 1
                return new_block
            return block

        styles = re.sub(r"<font>.*?</font>", repl, styles, flags=re.DOTALL)
        self._files["xl/styles.xml"] = styles.encode("utf-8")
        return changed

    def set_auto_calc(self) -> None:
        """Force full recalculation on workbook open and auto calc mode.
        The original file has calcPr without fullCalcOnLoad, so Excel
        opens with possibly-stale cached values. This writes
        calcMode="auto" and fullCalcOnLoad="1" on the existing calcPr."""
        wb_xml = self._files["xl/workbook.xml"].decode("utf-8")
        # Parse out existing calcPr
        m = re.search(r"<calcPr\b([^/>]*)/>", wb_xml)
        if not m:
            # No calcPr element at all -- insert one before </workbook>
            wb_xml = wb_xml.replace(
                "</workbook>",
                '<calcPr calcMode="auto" fullCalcOnLoad="1"/></workbook>',
                1,
            )
        else:
            attrs = m.group(1)
            # Ensure calcMode="auto"
            if re.search(r'\bcalcMode="[^"]*"', attrs):
                attrs = re.sub(
                    r'\bcalcMode="[^"]*"', 'calcMode="auto"', attrs
                )
            else:
                attrs = attrs + ' calcMode="auto"'
            # Ensure fullCalcOnLoad="1"
            if re.search(r'\bfullCalcOnLoad="[^"]*"', attrs):
                attrs = re.sub(
                    r'\bfullCalcOnLoad="[^"]*"', 'fullCalcOnLoad="1"', attrs
                )
            else:
                attrs = attrs + ' fullCalcOnLoad="1"'
            wb_xml = wb_xml[: m.start()] + f"<calcPr{attrs}/>" + wb_xml[m.end():]
        self._files["xl/workbook.xml"] = wb_xml.encode("utf-8")

    # ------------------------------------------------------------------
    # Sheet creation (for Sync Log)
    # ------------------------------------------------------------------
    def add_sheet(self, sheet_name: str) -> str:
        """Add a new worksheet. Returns the sheet's internal path.
        Does the minimum of content-type and rel updates."""
        if sheet_name in self._sheet_name_to_path:
            raise ValueError(f"sheet {sheet_name!r} already exists")

        # Find the next free sheetN.xml slot
        existing = {p for p in self._files if p.startswith("xl/worksheets/sheet") and p.endswith(".xml")}
        i = 1
        while f"xl/worksheets/sheet{i}.xml" in existing:
            i += 1
        new_path = f"xl/worksheets/sheet{i}.xml"

        # Minimal valid sheet xml
        minimal = (
            f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            f'<worksheet xmlns="{NS}" '
            f'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheetData/>'
            f'<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
            f'</worksheet>'
        )
        self._files[new_path] = minimal.encode("utf-8")

        # Update workbook.xml: add <sheet name="X" sheetId="M" r:id="rNN"/>
        wb_xml = self._files["xl/workbook.xml"].decode("utf-8")
        # Pick next rId and sheetId
        max_rid = 0
        for m in re.finditer(r'r:id="rId(\d+)"', wb_xml):
            max_rid = max(max_rid, int(m.group(1)))
        max_sheet_id = 0
        for m in re.finditer(r'sheetId="(\d+)"', wb_xml):
            max_sheet_id = max(max_sheet_id, int(m.group(1)))
        new_rid = f"rId{max_rid + 1}"
        new_sheet_id = max_sheet_id + 1
        new_sheet_tag = (
            f'<sheet name="{sheet_name}" sheetId="{new_sheet_id}" '
            f'state="visible" r:id="{new_rid}"/>'
        )
        wb_xml = wb_xml.replace("</sheets>", new_sheet_tag + "</sheets>", 1)
        self._files["xl/workbook.xml"] = wb_xml.encode("utf-8")

        # Update xl/_rels/workbook.xml.rels
        rels_xml = self._files["xl/_rels/workbook.xml.rels"].decode("utf-8")
        new_rel = (
            f'<Relationship Type="http://schemas.openxmlformats.org/'
            f'officeDocument/2006/relationships/worksheet" '
            f'Target="/{new_path}" Id="{new_rid}"/>'
        )
        rels_xml = rels_xml.replace(
            "</Relationships>", new_rel + "</Relationships>", 1
        )
        self._files["xl/_rels/workbook.xml.rels"] = rels_xml.encode("utf-8")

        # Update [Content_Types].xml: add Override for the new sheet part
        ct_xml = self._files["[Content_Types].xml"].decode("utf-8")
        new_override = (
            f'<Override PartName="/{new_path}" '
            f'ContentType="application/vnd.openxmlformats-officedocument.'
            f'spreadsheetml.worksheet+xml"/>'
        )
        ct_xml = ct_xml.replace("</Types>", new_override + "</Types>", 1)
        self._files["[Content_Types].xml"] = ct_xml.encode("utf-8")

        # Register the new sheet in our local map
        self._sheet_name_to_path[sheet_name] = new_path
        return new_path
