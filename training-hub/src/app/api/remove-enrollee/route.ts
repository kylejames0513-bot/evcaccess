import { removeEnrollee } from "@/lib/training-data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, name } = body;

    if (!sessionId || !name) {
      return Response.json(
        { error: "Missing required fields: sessionId, name" },
        { status: 400 }
      );
    }

    const result = await removeEnrollee(sessionId, name);
    if (!result.success) {
      return Response.json({ error: result.message }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
