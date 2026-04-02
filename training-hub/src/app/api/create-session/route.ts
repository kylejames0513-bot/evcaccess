import { createSession } from "@/lib/training-data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trainingType, date, time, location, enrollees } = body;

    if (!trainingType || !date) {
      return Response.json(
        { error: "Missing required fields: trainingType, date" },
        { status: 400 }
      );
    }

    const result = await createSession(
      trainingType,
      date,
      time || "",
      location || "",
      enrollees || []
    );

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
