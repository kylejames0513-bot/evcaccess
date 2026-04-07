import { readRange, updateCell } from "@/lib/google-sheets";
import { invalidateAll } from "@/lib/cache";

const SHEET_NAME = "Training Records";

export async function GET() {
  try {
    const rows = await readRange(SHEET_NAME);
    if (rows.length < 2) {
      return Response.json({ records: [], pendingCount: 0, passCount: 0, failCount: 0 });
    }

    // Skip header row (index 0)
    const records = rows.slice(1).map((row, i) => ({
      rowIndex: i + 2, // 1-based, skip header = row 2 is first data row
      arrivalTime: row[0] || "",
      session: row[1] || "",
      attendee: row[2] || "",
      date: row[3] || "",
      leftEarly: row[4] || "",
      reason: row[5] || "",
      notes: row[6] || "",
      endTime: row[7] || "",
      sessionLength: row[8] || "",
      passFail: row[9] || "",
      reviewedBy: row[10] || "",
    }));

    const pendingCount = records.filter((r) => !r.passFail || r.passFail.toLowerCase() === "pending").length;
    const passCount = records.filter((r) => r.passFail.toLowerCase() === "pass").length;
    const failCount = records.filter((r) => r.passFail.toLowerCase() === "fail").length;

    return Response.json({ records, pendingCount, passCount, failCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, rowIndices, reviewedBy } = body;

    if (!action || !rowIndices || !Array.isArray(rowIndices) || rowIndices.length === 0) {
      return Response.json(
        { error: "Missing required fields: action, rowIndices (array)" },
        { status: 400 }
      );
    }

    if (action !== "bulk_pass" && action !== "bulk_fail") {
      return Response.json(
        { error: "action must be 'bulk_pass' or 'bulk_fail'" },
        { status: 400 }
      );
    }

    if (!reviewedBy || typeof reviewedBy !== "string" || !reviewedBy.trim()) {
      return Response.json(
        { error: "reviewedBy is required" },
        { status: 400 }
      );
    }

    const value = action === "bulk_pass" ? "Pass" : "Fail";

    for (const rowIndex of rowIndices) {
      await updateCell(SHEET_NAME, rowIndex, 9, value);
      await updateCell(SHEET_NAME, rowIndex, 10, reviewedBy.trim());
    }

    invalidateAll();

    return Response.json({
      success: true,
      updated: rowIndices.length,
      action: value,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
