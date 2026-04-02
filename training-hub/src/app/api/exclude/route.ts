import { addExcludedEmployee, removeExcludedEmployee } from "@/lib/hub-settings";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, name } = body;

    if (!name) {
      return Response.json({ error: "Missing name" }, { status: 400 });
    }

    let excluded: string[];
    if (action === "remove") {
      excluded = await removeExcludedEmployee(name);
    } else {
      excluded = await addExcludedEmployee(name);
    }

    return Response.json({ excluded });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
