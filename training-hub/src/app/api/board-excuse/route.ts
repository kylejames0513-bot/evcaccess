import { readRange, updateCell } from "@/lib/google-sheets";
import { namesMatch } from "@/lib/name-utils";
import { invalidateAll } from "@/lib/cache";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

// Board of Directors — exempt from all trainings
const BOARD_MEMBERS = [
  "Sherri Alley",
  "Tim Porter",
  "Melissa Jackson-Wade",
  "Becky Dodson",
  "Scott Britton",
  "Elaine Brubaker",
  "Traci Golbach",
  "Dana Hewit",
  "Jennifer Hultz",
  "Rachel Lokitz",
  "Douglas Mapp",
  "Ashley Saunders",
  "Jay Shepard",
  "Bert Simmons",
];

export async function POST() {
  try {
    const rows = await readRange("Training");
    if (rows.length < 2) return Response.json({ error: "Training sheet empty" }, { status: 400 });

    const headers = rows[0];
    const lCol = headers.findIndex((h) => h.trim().toUpperCase() === "L NAME");
    const fCol = headers.findIndex((h) => h.trim().toUpperCase() === "F NAME");
    if (lCol < 0 || fCol < 0) return Response.json({ error: "Name columns not found" }, { status: 400 });

    // Find all training column indices
    const trainingCols: number[] = [];
    const seen = new Set<string>();
    for (const def of TRAINING_DEFINITIONS) {
      if (seen.has(def.columnKey)) continue;
      seen.add(def.columnKey);
      const idx = headers.findIndex((h) => h.trim().toUpperCase() === def.columnKey.toUpperCase());
      if (idx >= 0) trainingCols.push(idx);
    }
    // Also include FIRSTAID if present
    const faIdx = headers.findIndex((h) => h.trim().toUpperCase() === "FIRSTAID");
    if (faIdx >= 0) trainingCols.push(faIdx);

    let matched = 0;
    let cellsWritten = 0;

    for (let r = 1; r < rows.length; r++) {
      const last = (rows[r][lCol] || "").trim();
      const first = (rows[r][fCol] || "").trim();
      const fullName = first ? `${first} ${last}` : last;
      if (!fullName) continue;

      const isBoard = BOARD_MEMBERS.some((bm) => namesMatch(bm, fullName));
      if (!isBoard) continue;

      matched++;

      for (const colIdx of trainingCols) {
        const current = (rows[r][colIdx] || "").trim().toUpperCase();
        // Don't overwrite if already has BOARD or another excusal
        if (current === "BOARD") continue;
        // Write BOARD to every training column
        await updateCell("Training", r + 1, colIdx, "BOARD");
        cellsWritten++;
      }
    }

    invalidateAll();
    return Response.json({
      success: true,
      matched,
      cellsWritten,
      message: `Found ${matched} board member(s), wrote BOARD to ${cellsWritten} cell(s)`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ members: BOARD_MEMBERS });
}
