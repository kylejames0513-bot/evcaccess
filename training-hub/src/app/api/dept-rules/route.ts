import { getDeptRules, setDeptRule, removeDeptRule } from "@/lib/hub-settings";

export async function GET() {
  try {
    const rules = await getDeptRules();
    return Response.json({ rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, department, trainings } = body;

    if (!department) {
      return Response.json({ error: "Missing department" }, { status: 400 });
    }

    if (action === "remove") {
      const rules = await removeDeptRule(department);
      return Response.json({ rules });
    }

    if (!trainings || !Array.isArray(trainings)) {
      return Response.json({ error: "Missing trainings array" }, { status: 400 });
    }

    const rules = await setDeptRule(department, trainings);
    return Response.json({ rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
