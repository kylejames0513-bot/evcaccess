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

    // Basic date validation
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(completionDate)) {
      return Response.json(
        { error: "Invalid date format. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const parsed = new Date(completionDate);
    if (isNaN(parsed.getTime())) {
      return Response.json(
        { error: "Invalid date value." },
        { status: 400 }
      );
    }

    // Reject future dates > 1 year out
    const oneYearOut = new Date();
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    if (parsed > oneYearOut) {
      return Response.json(
        { error: "Date cannot be more than 1 year in the future." },
        { status: 400 }
      );
    }

    const result = await recordCompletion(employeeName, trainingColumnKey, completionDate);

    if (!result.success) {
      return Response.json({ error: result.message }, { status: 404 });
    }

    return Response.json({ message: result.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
