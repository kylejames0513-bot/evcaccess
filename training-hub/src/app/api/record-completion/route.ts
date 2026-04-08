import { recordCompletion } from "@/lib/training-data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employeeName, trainingColumnKey, completionDate } = body;

    if (!employeeName || !trainingColumnKey || !completionDate) {
      return Response.json(
        { error: "Missing required fields: employeeName, trainingColumnKey, completionDate" },
        { status: 400 }
      );
    }

    // Accept any reasonable date format
    const dateStr = completionDate.trim();

    // Record in Supabase (training_records table)
    const result = await recordCompletion(employeeName, trainingColumnKey, dateStr);

    if (!result.success) {
      return Response.json({ error: result.message }, { status: 404 });
    }

    return Response.json({ message: result.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
