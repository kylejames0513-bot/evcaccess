import { getEmployeesNeedingTraining } from "@/lib/training-data";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const training = searchParams.get("training");

    if (!training) {
      return Response.json(
        { error: "Missing query param: training" },
        { status: 400 }
      );
    }

    const employees = await getEmployeesNeedingTraining(training);
    return Response.json({ employees });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
