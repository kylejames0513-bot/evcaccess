import { readRange, writeRange } from "@/lib/google-sheets";
import { invalidateAll } from "@/lib/cache";

const SETTINGS_SHEET = "Hub Settings";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employee = searchParams.get("employee");

    const rows = await readRange(`'${SETTINGS_SHEET}'`);
    const notes: Record<string, string> = {};

    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][0] || "").trim() !== "training_note") continue;
      const key = (rows[i][1] || "").trim();
      const val = (rows[i][2] || "").trim();
      if (!key || !val) continue;

      // If employee filter, only return their notes
      if (employee) {
        if (key.toLowerCase().startsWith(employee.toLowerCase() + "|")) {
          const trainingKey = key.split("|")[1];
          notes[trainingKey] = val;
        }
      } else {
        notes[key] = val;
      }
    }

    return Response.json({ notes });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employee, training, note } = body;

    if (!employee || !training) {
      return Response.json({ error: "Missing employee or training" }, { status: 400 });
    }

    const settingsKey = `${employee}|${training}`;
    const rows = await readRange(`'${SETTINGS_SHEET}'`);

    // Find existing note
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][0] || "").trim() === "training_note" &&
          (rows[i][1] || "").trim().toLowerCase() === settingsKey.toLowerCase()) {
        if (note) {
          // Update
          await writeRange(`'${SETTINGS_SHEET}'!C${i + 1}`, [[note]]);
        } else {
          // Clear
          await writeRange(`'${SETTINGS_SHEET}'!A${i + 1}:C${i + 1}`, [["", "", ""]]);
        }
        invalidateAll();
        return Response.json({ success: true });
      }
    }

    // Add new
    if (note) {
      const nextRow = rows.length + 1;
      await writeRange(`'${SETTINGS_SHEET}'!A${nextRow}:C${nextRow}`, [["training_note", settingsKey, note]]);
      invalidateAll();
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown" }, { status: 500 });
  }
}
