import { getDeptRules, setDeptRule, removeDeptRule } from "@/lib/hub-settings";
import { readRange, getSheets, getSpreadsheetId } from "@/lib/google-sheets";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { invalidateAll } from "@/lib/cache";

export async function GET() {
  try {
    const rules = await getDeptRules();
    return Response.json({ rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

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
    const { action, department } = body;

    if (!department) {
      return Response.json({ error: "Missing department" }, { status: 400 });
    }

    if (action === "remove") {
      const rules = await removeDeptRule(department);
      return Response.json({ rules });
    }

    const { tracked, required } = body;
    if (!tracked || !Array.isArray(tracked)) {
      return Response.json({ error: "Missing tracked array" }, { status: 400 });
    }

    const rules = await setDeptRule(department, tracked, required || []);

    // Apply changes to Training sheet immediately
    try {
      await applyRuleToSheet(department, new Set(tracked));
    } catch (err) {
      console.error("Failed to apply rule to sheet:", err);
    }

    return Response.json({ rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Apply a department rule to the Training sheet:
 * - Untracked + empty → write NA
 * - Tracked + NA → clear to empty
 */
async function applyRuleToSheet(department: string, trackedSet: Set<string>) {
  const rows = await readRange("Training");
  if (rows.length < 2) return;

  const headers = rows[0];
  const hdr = (label: string) => headers.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());
  const activeCol = hdr("ACTIVE");
  const divCol = hdr("Division Description");
  if (divCol < 0) return;

  // Find all training column indices
  const allTrainingCols: Array<{ key: string; index: number }> = [];
  const seenKeys = new Set<string>();
  for (const def of TRAINING_DEFINITIONS) {
    if (seenKeys.has(def.columnKey)) continue;
    seenKeys.add(def.columnKey);
    const idx = hdr(def.columnKey);
    if (idx >= 0) allTrainingCols.push({ key: def.columnKey, index: idx });
  }
  // Also FIRSTAID
  const faIdx = hdr("FIRSTAID");
  if (faIdx >= 0 && !seenKeys.has("FIRSTAID")) {
    allTrainingCols.push({ key: "FIRSTAID", index: faIdx });
  }

  const deptLower = department.toLowerCase();
  const writes: Array<{ range: string; values: string[][] }> = [];

  for (let r = 1; r < rows.length; r++) {
    if (activeCol >= 0) {
      const active = (rows[r][activeCol] || "").toString().trim().toUpperCase();
      if (active !== "Y") continue;
    }

    const empDiv = (rows[r][divCol] || "").trim().toLowerCase();
    // Match with flexible hyphen spacing
    const matches = empDiv === deptLower ||
      empDiv.replace(/\s*-\s*/g, "-") === deptLower.replace(/\s*-\s*/g, "-") ||
      empDiv.replace(/\s*-\s*/g, " - ") === deptLower.replace(/\s*-\s*/g, " - ");
    if (!matches) continue;

    for (const col of allTrainingCols) {
      const cellVal = (rows[r][col.index] || "").toString().trim();
      const cellUpper = cellVal.toUpperCase();
      const colLetter = colToLetter(col.index);

      if (trackedSet.has(col.key)) {
        // Tracked — clear NA
        if (cellUpper === "NA" || cellUpper === "N/A") {
          writes.push({ range: `Training!${colLetter}${r + 1}`, values: [[""]] });
        }
      } else {
        // Not tracked — write NA if empty
        if (!cellVal) {
          writes.push({ range: `Training!${colLetter}${r + 1}`, values: [["NA"]] });
        }
      }
    }
  }

  // Batch write in chunks
  if (writes.length > 0) {
    const sheets = getSheets();
    for (let i = 0; i < writes.length; i += 50) {
      const chunk = writes.slice(i, i + 50);
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: getSpreadsheetId(),
        requestBody: { valueInputOption: "USER_ENTERED", data: chunk },
      });
      if (i + 50 < writes.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    invalidateAll();
  }
}
