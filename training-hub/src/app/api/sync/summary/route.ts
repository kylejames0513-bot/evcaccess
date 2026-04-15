import { withApiHandler, ApiError } from "@/lib/api-handler";
import { createServerClient } from "@/lib/supabase";
import { getSyncLog } from "@/lib/hub-settings";
import { computeDataHealthSummary } from "@/lib/data-health-summary";

export const GET = withApiHandler(async () => {
  const db = createServerClient();
  const quality = await computeDataHealthSummary();

  const [{ count: employeeCount, error: empErr }, { count: recordCount, error: recErr }, { count: excusalCount, error: excErr }, { count: scheduledCount, error: schedErr }, log] =
    await Promise.all([
      db.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true),
      db.from("training_records").select("*", { count: "exact", head: true }),
      db.from("excusals").select("*", { count: "exact", head: true }),
      db
        .from("training_sessions")
        .select("*", { count: "exact", head: true })
        .in("status", ["scheduled", "in_progress"]),
      getSyncLog(),
    ]);

  if (empErr) throw new ApiError(`failed to count employees: ${empErr.message}`, 500, "internal");
  if (recErr) throw new ApiError(`failed to count training records: ${recErr.message}`, 500, "internal");
  if (excErr) throw new ApiError(`failed to count excusals: ${excErr.message}`, 500, "internal");
  if (schedErr) throw new ApiError(`failed to count sessions: ${schedErr.message}`, 500, "internal");

  const sorted = log.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const lastSync = sorted[0] ?? null;
  const recentSyncs = sorted.slice(0, 10);

  return {
    roster: {
      activeEmployees: employeeCount ?? 0,
      inactiveEmployees: Math.max(0, quality.totalEmployees - (employeeCount ?? 0)),
    },
    records: {
      totalTrainingRecords: recordCount ?? 0,
      totalExcusals: excusalCount ?? 0,
      upcomingSessions: scheduledCount ?? 0,
    },
    latestSync: lastSync,
    recentSyncs,
    dataQuality: {
      total: quality.total,
      missingDepartment: quality.missingDepartment,
      missingHireDate: quality.missingHireDate,
      badDates: quality.badDates,
      duplicates: quality.duplicates,
      orphanRecords: quality.orphanRecords,
      orphanExcusals: quality.orphanExcusals,
    },
  };
});
