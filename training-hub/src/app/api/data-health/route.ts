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
]);

function isExcusal(value: string): boolean {
  return EXCUSAL_CODES.has(value.trim().toUpperCase());
}

function isValidDate(value: string): boolean {
  const s = value.trim();

  // MM/DD/YYYY or M/D/YYYY or M/D/YY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const d = new Date(s);
    return !isNaN(d.getTime());
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    return !isNaN(d.getTime());
  }

  // "Month Day, Year" or "Month Day Year"
  if (/^[A-Za-z]+\s+\d{1,2},?\s*\d{4}$/.test(s)) {
    const d = new Date(s);
    return !isNaN(d.getTime());
  }

  // Try native Date as fallback
  const d = new Date(s);
  return !isNaN(d.getTime()) && d.getFullYear() > 2000;
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

    // Build list of training column indices
    const trainingColKeys = TRAINING_DEFINITIONS.map((d) => d.columnKey);
    const trainingCols: Array<{ key: string; index: number }> = [];
    for (const key of trainingColKeys) {
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

      // Garbled dates: check each training column
      for (const col of trainingCols) {
        const value = (row[col.index] || "").trim();
        if (!value) continue;
        if (isExcusal(value)) continue;
        if (!isValidDate(value)) {
          // Try to suggest a clean date
          let suggestion = "";
          try {
            const d = new Date(value);
            if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
              suggestion = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
            }
          } catch {}
          garbledDates.push({ row: rowNum, name, column: col.key, value, suggestion });
        }
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
