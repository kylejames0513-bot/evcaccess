import { readRange } from "@/lib/google-sheets";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

// Excusal codes — mirrors the set in training-data.ts
const EXCUSAL_CODES = new Set([
  "NA", "N/A", "N/",
  "VP", "DIR", "DIRECTOR", "CEO", "CFO", "COO", "CMO",
  "AVP", "SVP", "EVP", "PRESIDENT",
  "MGR", "MANAGER", "SUPERVISOR", "SUPV",
  "ELC", "EI",
  "FACILITIES", "MAINT",
  "HR", "FINANCE", "FIN", "IT", "ADMIN",
  "NURSE", "LPN", "RN", "CNA",
  "BH", "PA", "BA", "QA", "TAC",
  "FX1", "FX2", "FX3", "FS",
  "F X 2", "FX 1",
  "FX1*", "FX1/NS", "FX1 - S", "FX1 - R",
  "TRAINER", "LP", "NS", "LLL",
  "BOARD",
]);

function isExcusal(value: string): boolean {
  return EXCUSAL_CODES.has(value.trim().toUpperCase());
}

function isCleanDate(value: string): boolean {
  // ONLY M/D/YYYY or MM/DD/YYYY with 4-digit year is clean
  const s = value.trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return false;
  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  const year = parseInt(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1990 && year <= 2100;
}

function tryParseDateSuggestion(value: unknown): string {
  // Try to parse any format into M/D/YYYY
  if (!value) return "";

  // If it's a Date object from Google Sheets
  if (value instanceof Date || (typeof value === "object" && value !== null && "getTime" in (value as object))) {
    const d = value as Date;
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1990 && d.getFullYear() <= 2100) {
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }
  }

  const s = String(value).trim();

  // Already clean
  if (isCleanDate(s)) return s;

  // M/D/YY — expand to 4-digit year
  const shortYear = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortYear) {
    let year = parseInt(shortYear[3]);
    year += year < 50 ? 2000 : 1900;
    return `${parseInt(shortYear[1])}/${parseInt(shortYear[2])}/${year}`;
  }

  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${parseInt(iso[2])}/${parseInt(iso[3])}/${iso[1]}`;
  }

  // Try native parse as last resort
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1990 && d.getFullYear() <= 2100) {
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }
  } catch {}

  return "";
}

export async function GET() {
  try {
    const rows = await readRange("Training");
    if (rows.length < 2) {
      return Response.json({
        issues: {
          garbledDates: [],
          duplicateEmployees: [],
          cprFaMismatch: [],
          emptyRows: [],
          missingNames: [],
        },
        summary: { total: 0, garbled: 0, duplicates: 0, mismatches: 0, empty: 0, missing: 0 },
      });
    }

    const headers = rows[0];
    const hdr = (label: string) =>
      headers.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());

    const lNameCol = hdr("L NAME");
    const fNameCol = hdr("F NAME");
    const activeCol = hdr("ACTIVE");
    const cprCol = hdr("CPR");
    const faCol = hdr("FIRSTAID");

    // Build list of ALL training column indices (including FIRSTAID)
    const trainingColKeysSet = new Set(TRAINING_DEFINITIONS.map((d) => d.columnKey));
    trainingColKeysSet.add("FIRSTAID");
    const trainingCols: Array<{ key: string; index: number }> = [];
    for (const key of trainingColKeysSet) {
      const idx = headers.findIndex(
        (h) => h.trim().toUpperCase() === key.toUpperCase()
      );
      if (idx >= 0) trainingCols.push({ key, index: idx });
    }

    const garbledDates: Array<{ row: number; name: string; column: string; value: string; suggestion: string }> = [];
    const cprFaMismatch: Array<{ row: number; name: string; cprDate: string; faDate: string }> = [];
    const emptyRows: number[] = [];
    const missingNames: number[] = [];

    // For duplicate detection: track active employees by name
    const nameRows = new Map<string, number[]>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1; // 1-based sheet row (header is row 1)
      const lastName = (lNameCol >= 0 ? row[lNameCol] || "" : "").trim();
      const firstName = (fNameCol >= 0 ? row[fNameCol] || "" : "").trim();
      const name = firstName ? `${lastName}, ${firstName}` : lastName;

      // Empty rows: L NAME is empty but row has some data
      if (!lastName) {
        const hasData = row.some((cell) => cell && cell.trim());
        if (hasData) {
          emptyRows.push(rowNum);
        }
        continue;
      }

      // Missing names: L NAME exists but F NAME is empty
      if (!firstName) {
        missingNames.push(rowNum);
      }

      // Track active employees for duplicate check
      const activeFlag = activeCol >= 0
        ? (row[activeCol] || "").toString().trim().toUpperCase()
        : "Y";
      if (activeFlag === "Y") {
        const nameKey = name.toLowerCase();
        const existing = nameRows.get(nameKey);
        if (existing) {
          existing.push(rowNum);
        } else {
          nameRows.set(nameKey, [rowNum]);
        }
      }

      // Garbled dates: flag anything not in clean M/D/YYYY format
      for (const col of trainingCols) {
        const rawValue = row[col.index];
        const value = (rawValue || "").toString().trim();
        if (!value) continue;
        if (isExcusal(value)) continue;
        if (isCleanDate(value)) continue;
        // Not clean — flag it with a suggestion
        const suggestion = tryParseDateSuggestion(rawValue);
        garbledDates.push({ row: rowNum, name, column: col.key, value: value.substring(0, 60), suggestion });
      }

      // CPR/FA mismatch
      if (cprCol >= 0 && faCol >= 0) {
        const cprVal = (row[cprCol] || "").trim();
        const faVal = (row[faCol] || "").trim();
        // Only flag if both have dates
        if (
          cprVal && faVal &&
          !isExcusal(cprVal) && !isExcusal(faVal) &&
          isValidDate(cprVal) && isValidDate(faVal) &&
          cprVal !== faVal
        ) {
          cprFaMismatch.push({ row: rowNum, name, cprDate: cprVal, faDate: faVal });
        }
      }
    }

    // Duplicate employees: names appearing more than once among active
    const duplicateEmployees: Array<{ name: string; rows: number[] }> = [];
    for (const [nameKey, rowNums] of nameRows) {
      if (rowNums.length > 1) {
        // Use the first occurrence's cased name for display
        const displayRow = rows[rowNums[0] - 1];
        const ln = (lNameCol >= 0 ? displayRow[lNameCol] || "" : "").trim();
        const fn = (fNameCol >= 0 ? displayRow[fNameCol] || "" : "").trim();
        const displayName = fn ? `${ln}, ${fn}` : ln;
        duplicateEmployees.push({ name: displayName, rows: rowNums });
      }
    }

    const totalIssues =
      garbledDates.length +
      duplicateEmployees.length +
      cprFaMismatch.length +
      emptyRows.length +
      missingNames.length;

    return Response.json({
      issues: {
        garbledDates,
        duplicateEmployees,
        cprFaMismatch,
        emptyRows,
        missingNames,
      },
      summary: {
        total: totalIssues,
        garbled: garbledDates.length,
        duplicates: duplicateEmployees.length,
        mismatches: cprFaMismatch.length,
        empty: emptyRows.length,
        missing: missingNames.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
