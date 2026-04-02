import { setCapacityOverride } from "@/lib/hub-settings";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trainingName, capacity } = body;

    if (!trainingName || typeof capacity !== "number" || capacity < 1) {
      return Response.json(
        { error: "Missing trainingName or invalid capacity (must be >= 1)" },
        { status: 400 }
      );
    }

    const overrides = await setCapacityOverride(trainingName, capacity);
    return Response.json({ overrides });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
