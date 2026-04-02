import { getNoShows, clearNoShows } from "@/lib/hub-settings";

export async function GET() {
  try {
    const noShows = await getNoShows();
    return Response.json({ noShows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, name } = body;

    if (action === "clear" && name) {
      await clearNoShows(name);
      const noShows = await getNoShows();
      return Response.json({ noShows });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
