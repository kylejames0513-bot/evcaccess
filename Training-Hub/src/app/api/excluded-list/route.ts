import { getExcludedEmployees } from "@/lib/hub-settings";

export async function GET() {
  try {
    const excluded = await getExcludedEmployees();
    return Response.json({ excluded });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
