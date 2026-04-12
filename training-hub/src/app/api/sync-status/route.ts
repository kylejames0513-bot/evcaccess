import { createServerClient } from "@/lib/supabase";
import { getSyncLog } from "@/lib/hub-settings";
import { withApiHandler } from "@/lib/api-handler";

export const GET = withApiHandler(async () => {
  const supabase = createServerClient();

  // Counts via head + count requests (no row data fetched)
  const [employeesCount, recordsCount, excusalsCount, sessionsCount, log] =
    await Promise.all([
      supabase
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      supabase.from("training_records").select("*", { count: "exact", head: true }),
      supabase.from("excusals").select("*", { count: "exact", head: true }),
      supabase
        .from("training_sessions")
        .select("*", { count: "exact", head: true })
        .in("status", ["scheduled", "in_progress"]),
      getSyncLog(),
    ]);

  const recent = log
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);

  return {
    counts: {
      activeEmployees: employeesCount.count ?? 0,
      trainingRecords: recordsCount.count ?? 0,
      excusals: excusalsCount.count ?? 0,
      upcomingSessions: sessionsCount.count ?? 0,
    },
    lastSync: recent[0] || null,
    recentSyncs: recent,
  };
});
