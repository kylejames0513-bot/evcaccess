import { getTrainingData } from "@/lib/training-data";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

export async function GET() {
  try {
    const data = await getTrainingData();

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
        rowIndex: emp.rowIndex,
        completedCount: completed,
        totalRequired: total,
        status: overallStatus,
      };
    });

    return Response.json({ employees });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
