import type { WorkSheet } from "xlsx";

export type SeparationSyncRow = {
  last_name: string;
  first_name: string | null;
  date_of_separation: string;
  sheet: string;
  row_number: number;
};

export type SeparationParseSummary = {
  fySheets: string[];
  totalRows: number;
  skippedRows: number;
};

export const SEPARATION_DATA_START_ROW = 9;
export const SEPARATION_DATA_END_ROW = 413;
export const MAX_SEPARATION_ROWS = 10_000;

export function parseSeparationWorkbook(wb: {
  SheetNames: string[];
  Sheets: Record<string, WorkSheet | undefined>;
}): { rows: SeparationSyncRow[]; summary: SeparationParseSummary } {
  const allRows: SeparationSyncRow[] = [];
  const fySheets: string[] = [];
  let skippedRows = 0;

  for (const sheetName of wb.SheetNames) {
    if (!/^fy\b/i.test(sheetName.trim())) continue;
    fySheets.push(sheetName);
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    for (let rowNumber = SEPARATION_DATA_START_ROW; rowNumber <= SEPARATION_DATA_END_ROW; rowNumber += 1) {
      const rawName = readCellText(sheet, `A${rowNumber}`);
      const rawDate = sheet[`B${rowNumber}`]?.v;
      const dateIso = toIsoDate(rawDate);
      if (!rawName || !dateIso) {
        if (rawName || rawDate != null) skippedRows += 1;
        continue;
      }

      const parsedName = splitName(rawName);
      if (!parsedName.last_name) {
        skippedRows += 1;
        continue;
      }

      allRows.push({
        last_name: parsedName.last_name,
        first_name: parsedName.first_name,
        date_of_separation: dateIso,
        sheet: sheetName,
        row_number: rowNumber,
      });
    }
  }

  return {
    rows: allRows,
    summary: {
      fySheets,
      totalRows: allRows.length,
      skippedRows,
    },
  };
}

export function readCellText(sheet: WorkSheet, address: string): string {
  const cell = sheet[address];
  if (!cell) return "";
  const value = cell.v;
  if (value == null) return "";
  return String(value).trim();
}

export function splitName(raw: string): { last_name: string; first_name: string | null } {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { last_name: "", first_name: null };

  if (value.includes(",")) {
    const parts = value.split(",");
    const last_name = (parts[0] ?? "").trim();
    const first_name = (parts[1] ?? "").trim() || null;
    return { last_name, first_name };
  }

  const parts = value.split(" ");
  if (parts.length === 1) return { last_name: parts[0], first_name: null };
  return {
    first_name: parts[0] || null,
    last_name: parts[parts.length - 1] || "",
  };
}

export function toIsoDate(input: unknown): string | null {
  if (input == null) return null;

  if (input instanceof Date && !Number.isNaN(input.valueOf())) {
    return input.toISOString().slice(0, 10);
  }

  if (typeof input === "number") {
    // Excel serial date -> JS date; 25569 is Excel epoch offset.
    const millis = Math.round((input - 25569) * 86400 * 1000);
    const date = new Date(millis);
    if (!Number.isNaN(date.valueOf())) return date.toISOString().slice(0, 10);
  }

  const value = String(input).trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed.toISOString().slice(0, 10);
}
