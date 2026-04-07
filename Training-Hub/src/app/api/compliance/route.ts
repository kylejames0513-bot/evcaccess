import { getComplianceIssues } from "@/lib/training-data";

export async function GET() {
  try {
    const issues = await getComplianceIssues();
    return Response.json({ issues });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
