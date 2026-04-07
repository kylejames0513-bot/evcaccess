import { getComplianceTracks, setComplianceTracks } from "@/lib/hub-settings";

export async function GET() {
  try {
    const tracks = await getComplianceTracks();
    return Response.json({ tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tracks } = body;

    if (!tracks || !Array.isArray(tracks)) {
      return Response.json({ error: "Missing tracks array" }, { status: 400 });
    }

    const result = await setComplianceTracks(tracks);
    return Response.json({ tracks: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
