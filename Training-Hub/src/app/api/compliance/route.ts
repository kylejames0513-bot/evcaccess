import { getComplianceIssues } from "@/lib/training-data";
import { getExpirationThresholds } from "@/lib/hub-settings";

export async function GET() {
  try {
    const [issues, thresholds] = await Promise.all([
      getComplianceIssues(),
      getExpirationThresholds(),
    ]);

    const now = new Date();

    // Compute daysUntilExpiry for each issue
    const enriched = issues.map((issue) => {
      let daysUntilExpiry: number | null = null;
      if (issue.expirationDate) {
        const exp = new Date(issue.expirationDate);
        daysUntilExpiry = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
      return { ...issue, daysUntilExpiry };
    });

    // Department summary
    const deptMap = new Map<string, { total: number; expired: number; expiring: number; needed: number }>();
    for (const issue of enriched) {
      const div = issue.division || "Unknown";
      if (!deptMap.has(div)) deptMap.set(div, { total: 0, expired: 0, expiring: 0, needed: 0 });
      const entry = deptMap.get(div)!;
      entry.total++;
      if (issue.status === "expired") entry.expired++;
      else if (issue.status === "expiring_soon") entry.expiring++;
      else if (issue.status === "needed") entry.needed++;
    }
    const departmentSummary = Array.from(deptMap.entries()).map(([division, stats]) => ({
      division,
      ...stats,
      complianceRate: stats.total > 0 ? Math.round(((stats.total - stats.expired - stats.expiring) / stats.total) * 100) : 100,
    })).sort((a, b) => a.complianceRate - b.complianceRate);

    // Expiration timeline buckets
    const timeline = { overdue: 0, critical: 0, warning: 0, notice: 0, safe: 0 };
    for (const issue of enriched) {
      if (issue.daysUntilExpiry === null) continue;
      if (issue.daysUntilExpiry < 0) timeline.overdue++;
      else if (issue.daysUntilExpiry <= thresholds.critical) timeline.critical++;
      else if (issue.daysUntilExpiry <= thresholds.warning) timeline.warning++;
      else if (issue.daysUntilExpiry <= thresholds.notice) timeline.notice++;
      else timeline.safe++;
    }

    return Response.json({
      issues: enriched,
      departmentSummary,
      expirationTimeline: timeline,
      thresholds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
