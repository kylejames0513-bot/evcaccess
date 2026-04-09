import { addEnrollees } from "@/lib/training-data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, names } = body;

    if (!sessionId || !names || !Array.isArray(names) || names.length === 0) {
      return Response.json(
        { error: "Missing required fields: sessionId, names (array)" },
        { status: 400 }
      );
    }

    const result = await addEnrollees(sessionId, names);
    if (!result.success) {
      return Response.json({ error: result.message }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
