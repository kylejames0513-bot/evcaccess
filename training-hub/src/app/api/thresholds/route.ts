import { getExpirationThresholds, setExpirationThresholds } from "@/lib/hub-settings";

export async function GET() {
  try {
    const thresholds = await getExpirationThresholds();
    return Response.json({ thresholds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { notice, warning, critical } = body;
    if (!notice || !warning || !critical) {
      return Response.json({ error: "All thresholds are required" }, { status: 400 });
    }
    const thresholds = await setExpirationThresholds({
      notice: Math.max(1, parseInt(notice)),
      warning: Math.max(1, parseInt(warning)),
      critical: Math.max(1, parseInt(critical)),
    });
    return Response.json({ thresholds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
