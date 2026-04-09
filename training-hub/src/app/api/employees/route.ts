import { getTrainingData } from "@/lib/training-data";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { getNoShows } from "@/lib/hub-settings";

export async function GET() {
  try {
    const [data, noShowRecords] = await Promise.all([
      getTrainingData(),
      getNoShows(),
    ]);

    // Build no-show count lookup
    const noShowCounts = new Map<string, number>();
    for (const rec of noShowRecords) {
      noShowCounts.set(rec.name.toLowerCase(), rec.incidents.length);
    }

    const employees = data.map((emp) => {
      const statuses = Object.values(emp.trainings);
      const total = statuses.length;
      const completed = statuses.filter(
        (t) => t.status === "current" || t.status === "excused"
      ).length;
      const hasExpired = statuses.some((t) => t.status === "expired");
      const hasExpiring = statuses.some((t) => t.status === "expiring_soon");

      let overallStatus: string;
      if (hasExpired) overallStatus = "expired";
      else if (hasExpiring) overallStatus = "expiring_soon";
      else if (completed < total) overallStatus = "needed";
      else overallStatus = "current";

      return {
        name: emp.name,
        employeeId: emp.employeeId,
        position: emp.position,
        completedCount: completed,
        totalRequired: total,
        status: overallStatus,
        noShowCount: noShowCounts.get(emp.name.toLowerCase()) || 0,
      };
    });

    return Response.json({ employees });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
