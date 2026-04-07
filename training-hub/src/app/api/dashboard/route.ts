import { getTrainingData, getScheduledSessions } from "@/lib/training-data";
import { getExpirationThresholds } from "@/lib/hub-settings";

export async function GET() {
  try {
    // Single call each — results are cached for 60s
    const [data, sessions, thresholds] = await Promise.all([
      getTrainingData(),
      getScheduledSessions(),
      getExpirationThresholds(),
    ]);

    // Build stats from training data
    let fullyCompliant = 0;
    let expiringSoon = 0;
    let expired = 0;
    let needed = 0;

    const urgentIssues: Array<{
      employee: string;
      training: string;
      status: string;
      date: string | null;
      expirationDate: string | null;
    }> = [];

    for (const emp of data) {
      let empHasIssue = false;
      for (const [key, t] of Object.entries(emp.trainings)) {
        if (t.status === "expired") { expired++; empHasIssue = true; }
        else if (t.status === "expiring_soon") { expiringSoon++; empHasIssue = true; }
        else if (t.status === "needed") { needed++; empHasIssue = true; }

        if (t.status === "expired" || t.status === "expiring_soon") {
          let expirationDate: string | null = null;
          if (t.date) {
            // Find the training def to get renewal years
            const { TRAINING_DEFINITIONS } = await import("@/config/trainings");
            const def = TRAINING_DEFINITIONS.find((d) => d.columnKey === key);
            if (def && def.renewalYears > 0) {
              const exp = new Date(t.date);
              exp.setFullYear(exp.getFullYear() + def.renewalYears);
              expirationDate = exp.toISOString().split("T")[0];
            }
          }
          urgentIssues.push({
            employee: emp.name,
            training: key,
            status: t.status,
            date: t.date ? t.date.toISOString().split("T")[0] : null,
            expirationDate,
          });
        }
      }
      if (!empHasIssue) fullyCompliant++;
    }

    // Sort urgent: expired first by date
    urgentIssues.sort((a, b) => {
      if (a.status !== b.status) return a.status === "expired" ? -1 : 1;
      return (a.expirationDate || "").localeCompare(b.expirationDate || "");
    });

    const upcoming = sessions
      .filter((s) => s.status === "scheduled")
      .sort((a, b) => a.sortDateMs - b.sortDateMs)
      .slice(0, 4);

    // Count critical expirations (within critical threshold days)
    const now = new Date();
    let criticalExpiring = 0;
    for (const issue of urgentIssues) {
      if (issue.expirationDate) {
        const exp = new Date(issue.expirationDate);
        const daysUntil = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= thresholds.critical) criticalExpiring++;
      }
    }

    return Response.json({
      stats: {
        totalEmployees: data.length,
        fullyCompliant,
        expiringSoon,
        expired,
        needed,
        upcomingSessions: sessions.filter((s) => s.status === "scheduled").length,
        criticalExpiring,
      },
      urgentIssues: urgentIssues.slice(0, 8),
      upcoming,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
