import { readRangeFresh, getSheets, getSpreadsheetId, writeRange } from "@/lib/google-sheets";
import { namesMatch } from "@/lib/name-utils";
import { invalidateAll } from "@/lib/cache";

function colToLetter(col: number): string {
  let letter = "";
  let c = col;
  while (c >= 0) {
    letter = String.fromCharCode(65 + (c % 26)) + letter;
    c = Math.floor(c / 26) - 1;
  }
  return letter;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fixes } = body;
    // fixes: Array<{ employee: string, training: string, date: string }>

    if (!fixes || !Array.isArray(fixes) || fixes.length === 0) {
      return Response.json({ error: "No fixes provided" }, { status: 400 });
    }

    const rows = await readRangeFresh("Training");
    const headers = rows[0];
    const hdr = (label: string) => headers.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
    const lNameCol = hdr("L NAME");
    const fNameCol = hdr("F NAME");

    if (lNameCol < 0 || fNameCol < 0) {
      return Response.json({ error: "L NAME / F NAME columns not found" }, { status: 400 });
    }

    // Build writes
    const data: Array<{ range: string; values: string[][] }> = [];
    let matched = 0;
    const errors: string[] = [];

    for (const fix of fixes) {
      // Find training column
      const colIdx = headers.findIndex((h) => h.trim().toUpperCase() === fix.training.toUpperCase());
      if (colIdx < 0) {
        errors.push(`Column "${fix.training}" not found`);
        continue;
      }

      // Find employee row
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

    // Batch write
    if (data.length > 0) {
      const sheets = getSheets();
      // Chunk into groups of 50 to stay under quota
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
    return Response.json({
      success: true,
      message: `Fixed ${matched} cell(s)${errors.length > 0 ? ". Errors: " + errors.slice(0, 3).join("; ") : ""}`,
      matched,
      errors: errors.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
