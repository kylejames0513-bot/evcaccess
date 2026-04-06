import { readRange, writeRange } from "@/lib/google-sheets";
import { invalidateAll } from "@/lib/cache";

// Stores name mappings in Hub Settings: Type="name_map", Key=paylocity name, Value=training sheet name
// This lets the audit and import match people whose names differ between systems

const SETTINGS_SHEET = "Hub Settings";

export async function GET() {
  try {
    const rows = await readRange(`'${SETTINGS_SHEET}'`);
    const mappings: Array<{ paylocityName: string; trainingName: string }> = [];
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][0] || "").trim() === "name_map") {
        mappings.push({
          paylocityName: (rows[i][1] || "").trim(),
          trainingName: (rows[i][2] || "").trim(),
        });
      }
    }
    return Response.json({ mappings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, paylocityName, trainingName } = body;

    if (action === "add" && paylocityName && trainingName) {
      const rows = await readRange(`'${SETTINGS_SHEET}'`);
      // Check for existing mapping
      for (let i = 1; i < rows.length; i++) {
        if ((rows[i][0] || "").trim() === "name_map" &&
            (rows[i][1] || "").trim().toLowerCase() === paylocityName.toLowerCase()) {
          // Update existing
          const rowNum = i + 1;
          await writeRange(`'${SETTINGS_SHEET}'!C${rowNum}`, [[trainingName]]);
          invalidateAll();
          return Response.json({ success: true, message: `Updated mapping: ${paylocityName} → ${trainingName}` });
        }
      }
      // Add new
      const nextRow = rows.length + 1;
      await writeRange(`'${SETTINGS_SHEET}'!A${nextRow}:C${nextRow}`, [["name_map", paylocityName, trainingName]]);
      invalidateAll();
      return Response.json({ success: true, message: `Added mapping: ${paylocityName} → ${trainingName}` });
    }

    if (action === "remove" && paylocityName) {
      const rows = await readRange(`'${SETTINGS_SHEET}'`);
      // Find and clear the row
      for (let i = 1; i < rows.length; i++) {
        if ((rows[i][0] || "").trim() === "name_map" &&
            (rows[i][1] || "").trim().toLowerCase() === paylocityName.toLowerCase()) {
          const rowNum = i + 1;
          await writeRange(`'${SETTINGS_SHEET}'!A${rowNum}:C${rowNum}`, [["", "", ""]]);
          invalidateAll();
          return Response.json({ success: true, message: `Removed mapping for ${paylocityName}` });
        }
      }
      return Response.json({ success: true, message: "Mapping not found" });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
