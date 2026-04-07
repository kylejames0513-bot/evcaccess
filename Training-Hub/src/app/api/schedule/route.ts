import { getScheduledSessions } from "@/lib/training-data";

export async function GET() {
  try {
    const sessions = await getScheduledSessions();
    return Response.json({ sessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
