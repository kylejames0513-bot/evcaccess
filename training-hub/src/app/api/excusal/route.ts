import { setExcusal } from "@/lib/training-data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employeeName, trainingColumnKey, excused } = body;

    if (!employeeName || !trainingColumnKey || typeof excused !== "boolean") {
      return Response.json(
        { error: "Missing required fields: employeeName, trainingColumnKey, excused (boolean)" },
        { status: 400 }
      );
    }

    const result = await setExcusal(employeeName, trainingColumnKey, excused);
    if (!result.success) {
      return Response.json({ error: result.message }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
