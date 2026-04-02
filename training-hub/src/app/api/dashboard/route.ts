import { getDashboardStats, getComplianceIssues, getScheduledSessions } from "@/lib/training-data";

export async function GET() {
  try {
    const [stats, issues, sessions] = await Promise.all([
      getDashboardStats(),
      getComplianceIssues(),
      getScheduledSessions(),
    ]);

    // Top 5 urgent issues for the dashboard
    const urgentIssues = issues.slice(0, 5);

    // Next 4 upcoming sessions
    const upcoming = sessions
      .filter((s) => s.status === "scheduled")
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);

    return Response.json({ stats, urgentIssues, upcoming });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
