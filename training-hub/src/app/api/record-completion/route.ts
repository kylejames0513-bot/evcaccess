import { recordCompletion } from "@/lib/training-data";
import { appendRows } from "@/lib/google-sheets";
import { invalidateAll } from "@/lib/cache";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { toFirstLast } from "@/lib/name-utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employeeName, trainingColumnKey, completionDate } = body;

    if (!employeeName || !trainingColumnKey || !completionDate) {
      return Response.json(
        { error: "Missing required fields: employeeName, trainingColumnKey, completionDate" },
        { status: 400 }
      );
    }

    // Accept any reasonable date format
    const dateStr = completionDate.trim();

    // Record on Training sheet
    const result = await recordCompletion(employeeName, trainingColumnKey, dateStr);

    if (!result.success) {
      return Response.json({ error: result.message }, { status: 404 });
    }

    // Also add a row to Training Records for record-keeping
    try {
      const def = TRAINING_DEFINITIONS.find(
        (d) => d.columnKey.toUpperCase() === trainingColumnKey.toUpperCase() ||
          d.name.toUpperCase() === trainingColumnKey.toUpperCase()
      );
      const sessionName = def ? def.name : trainingColumnKey;
      const attendeeName = toFirstLast(employeeName);
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

      await appendRows("Training Records", [[
        timeStr,          // Arrival Time
        sessionName,      // Session
        attendeeName,     // Attendee
        dateStr,          // Date
        "No",             // Left Early
        "",               // Reason
        "Manual entry via Hub",  // Notes
        "",               // End Time
        "",               // Session Length
        "Pass",           // Pass/Fail
        "Hub"             // Reviewed By
      ]]);
    } catch (err) {
      // Don't fail the main operation if Training Records write fails
      console.error("Failed to write to Training Records:", err);
    }

    invalidateAll();
    return Response.json({ message: result.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
