import { readRange, writeRange } from "@/lib/google-sheets";
import { invalidateAll } from "@/lib/cache";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionRowIndex, training, date, time, location } = body;

    if (!sessionRowIndex) {
      return Response.json({ error: "Missing sessionRowIndex" }, { status: 400 });
    }

    const rows = await readRange("Scheduled");
    const row = rows[sessionRowIndex - 1];
    if (!row) {
      return Response.json({ error: "Session row not found" }, { status: 400 });
    }

    // Build updated row — keep existing values if not provided
    const newTraining = training !== undefined ? training : (row[0] || "").trim();
    const newDate = date !== undefined ? date : (row[1] || "").trim();
    const newTime = time !== undefined ? time : (row[2] || "").trim();
    const newLocation = location !== undefined ? location : (row[3] || "").trim();
    const enrollment = (row[4] || "").trim(); // don't change enrollment
    const noShows = (row[5] || "").trim(); // don't change no-shows

    await writeRange(
      `Scheduled!A${sessionRowIndex}:F${sessionRowIndex}`,
      [[newTraining, newDate, newTime, newLocation, enrollment, noShows]]
    );

    invalidateAll();

    return Response.json({
      success: true,
      message: `Updated session: ${newTraining} on ${newDate}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
