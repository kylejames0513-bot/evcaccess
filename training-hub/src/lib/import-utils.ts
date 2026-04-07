import { readRangeFresh, getSheets, getSpreadsheetId } from "./google-sheets";
import { namesMatch } from "./name-utils";
import { invalidateAll } from "./cache";

// ============================================================
// Shared import/sync utilities for Paylocity, PHS, etc.
// ============================================================

export function normalizeDate(val: string): string {
  const s = val.trim();
  // M/D/YY → M/D/YYYY
  const short = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (short) {
    let yr = parseInt(short[3]);
    yr += yr < 50 ? 2000 : 1900;
    return `${parseInt(short[1])}/${parseInt(short[2])}/${yr}`;
  }
  // M/D/YYYY — strip leading zeros
  const full = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (full) return `${parseInt(full[1])}/${parseInt(full[2])}/${full[3]}`;
  // MM-DD-YY or MM-DD-YYYY (dashes)
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dash) {
    let yr = parseInt(dash[3]);
    if (yr < 100) yr += yr < 50 ? 2000 : 1900;
    return `${parseInt(dash[1])}/${parseInt(dash[2])}/${yr}`;
  }
  // Try Date parse
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1990) {
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }
  } catch {}
  return s;
}

export function parseToTimestamp(dateStr: string): number {
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2])).getTime();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function datesEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = parseToTimestamp(a);
  const tb = parseToTimestamp(b);
  if (ta && tb) return ta === tb;
  return false;
}

export function colToLetter(col: number): string {
  let letter = "";
  let c = col;
  while (c >= 0) {
    letter = String.fromCharCode(65 + (c % 26)) + letter;
    c = Math.floor(c / 26) - 1;
  }
  return letter;
}

export interface FixEntry {
  employee: string;
  training: string;
  date: string;
}

// Columns that must always stay in sync with each other.
// When a fix writes to one, the same date is written to all linked columns.
const LINKED_COLUMNS: Record<string, string[]> = {
  "CPR": ["FIRSTAID"],
  "FIRSTAID": ["CPR"],
};

/**
 * Batch-write fixes to the Training sheet.
 * Finds each employee row and training column, then writes the date.
 * Chunks in groups of 50 to stay under API quota.
 */
export async function applyFixes(fixes: FixEntry[]): Promise<{ matched: number; errors: string[] }> {
  const rows = await readRangeFresh("Training");
  const headers = rows[0];
  const hdr = (label: string) => headers.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
  const lNameCol = hdr("L NAME");
  const fNameCol = hdr("F NAME");

  if (lNameCol < 0 || fNameCol < 0) {
    return { matched: 0, errors: ["L NAME / F NAME columns not found"] };
  }

  // Expand fixes to include any linked columns (e.g. CPR ↔ FIRSTAID)
  const expanded: FixEntry[] = [];
  const seen = new Set<string>();
  for (const fix of fixes) {
    const key = `${fix.employee.toLowerCase()}|${fix.training.toUpperCase()}`;
    if (!seen.has(key)) { seen.add(key); expanded.push(fix); }
    for (const linked of LINKED_COLUMNS[fix.training.toUpperCase()] || []) {
      const lKey = `${fix.employee.toLowerCase()}|${linked}`;
      if (!seen.has(lKey)) {
        seen.add(lKey);
        expanded.push({ employee: fix.employee, training: linked, date: fix.date });
      }
    }
  }

  const data: Array<{ range: string; values: string[][] }> = [];
  let matched = 0;
  const errors: string[] = [];

  for (const fix of expanded) {
    const colIdx = headers.findIndex((h) => h.trim().toUpperCase() === fix.training.toUpperCase());
    if (colIdx < 0) {
      errors.push(`Column "${fix.training}" not found`);
      continue;
    }

    let empRow = -1;
    for (let r = 1; r < rows.length; r++) {
      const last = (rows[r][lNameCol] || "").trim();
      const first = (rows[r][fNameCol] || "").trim();
      const combined = first ? `${last}, ${first}` : last;
      if (namesMatch(combined, fix.employee)) {
        empRow = r + 1; // 1-based sheet row
        break;
      }
    }

    if (empRow < 0) {
      errors.push(`Employee "${fix.employee}" not found`);
      continue;
    }

    const col = colToLetter(colIdx);
    data.push({ range: `Training!${col}${empRow}`, values: [[fix.date]] });
    matched++;
  }

  if (data.length > 0) {
    const sheets = getSheets();
    for (let i = 0; i < data.length; i += 50) {
      const chunk = data.slice(i, i + 50);
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: getSpreadsheetId(),
        requestBody: { valueInputOption: "USER_ENTERED", data: chunk },
      });
      if (i + 50 < data.length) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  invalidateAll();
  return { matched, errors };
}

/**
 * Load name mappings from Hub Settings sheet.
 * Returns a Map of lowercase source name → training sheet name.
 */
export function loadNameMappings(settingsRows: string[][]): Map<string, string> {
  const mappings = new Map<string, string>();
  for (let i = 1; i < settingsRows.length; i++) {
    if ((settingsRows[i][0] || "").trim() === "name_map") {
      const sourceName = (settingsRows[i][1] || "").trim().toLowerCase();
      const targetName = (settingsRows[i][2] || "").trim();
      if (sourceName && targetName) mappings.set(sourceName, targetName);
    }
  }
  return mappings;
}

/**
 * Parse a CSV string into rows.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          cells.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
}
