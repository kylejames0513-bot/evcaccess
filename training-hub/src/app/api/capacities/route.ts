import { getCapacityOverrides } from "@/lib/capacity-overrides";

export async function GET() {
  return Response.json({ overrides: getCapacityOverrides() });
}
