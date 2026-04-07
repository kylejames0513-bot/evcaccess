import { getSyncLog } from "@/lib/hub-settings";

export async function GET() {
  try {
    const log = await getSyncLog();
    return Response.json({ log });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
