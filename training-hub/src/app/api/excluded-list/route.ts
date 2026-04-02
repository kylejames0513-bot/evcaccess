import { getExcludedEmployees } from "@/lib/exclude-list";

export async function GET() {
  return Response.json({ excluded: getExcludedEmployees() });
}
