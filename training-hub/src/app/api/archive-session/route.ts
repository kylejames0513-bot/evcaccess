import { archiveSession } from "@/lib/training-data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return Response.json(
        { error: "Missing required field: sessionId" },
        { status: 400 }
      );
    }

    const result = await archiveSession(sessionId);
    if (!result.success) {
      return Response.json({ error: result.message }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
