import { readRange, updateCell } from "@/lib/google-sheets";
import { invalidateAll } from "@/lib/cache";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { division, trainingColumnKey, reason } = body;

    if (!division || !trainingColumnKey || !reason) {
      return Response.json(
        { error: "Missing required fields: division, trainingColumnKey, reason" },
        { status: 400 }
      );
    }

    const rows = await readRange("Training");
    if (rows.length < 2) {
      return Response.json({ error: "Training sheet is empty" }, { status: 400 });
    }

    const headers = rows[0];
    const hdr = (label: string) =>
      headers.findIndex((h) => h.trim().toUpperCase() === label.toUpperCase());

    const activeCol = hdr("ACTIVE");
    const divCol = hdr("Division Description");
    const trainingCol = hdr(trainingColumnKey);

    if (divCol < 0) {
      return Response.json({ error: "Division Description column not found" }, { status: 400 });
    }
    if (trainingCol < 0) {
      return Response.json({ error: `Training column "${trainingColumnKey}" not found` }, { status: 400 });
    }

    let excused = 0;
    let skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Only active employees
      if (activeCol >= 0) {
        const active = (row[activeCol] || "").toString().trim().toUpperCase();
        if (active !== "Y") continue;
      }

      // Match division
      const empDiv = (row[divCol] || "").trim();
      if (empDiv.toLowerCase() !== division.toLowerCase()) continue;

      // Check current value — skip if already has a date or excusal
      const currentValue = (row[trainingCol] || "").trim();
      if (currentValue) {
        skipped++;
        continue;
      }

      // Write the reason
      await updateCell("Training", i + 1, trainingCol, reason);
      excused++;
    }

    invalidateAll();

    return Response.json({ success: true, excused, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
