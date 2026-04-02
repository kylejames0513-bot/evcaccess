import { getCapacityOverrides } from "@/lib/hub-settings";

export async function GET() {
  try {
    const overrides = await getCapacityOverrides();
    return Response.json({ overrides });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
