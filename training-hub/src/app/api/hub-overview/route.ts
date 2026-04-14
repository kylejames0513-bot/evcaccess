import { withApiHandler } from "@/lib/api-handler";
import { getComplianceSummary, listCompliance } from "@/lib/db/compliance";
import { createServerClient } from "@/lib/supabase";

interface SessionRow {
  id: string;
  session_date: string;
  start_time: string | null;
  capacity: number;
  training_type_id: number;
}

interface EnrollmentRow {
  session_id: string;
}

interface TrainingTypeRow {
  id: number;
  name: string;
}

interface SyncLogRow {
  timestamp: string;
  source: string;
  applied: number;
  skipped: number;
  errors: number;
}

interface NewHireRow {
  id: string;
  division: string | null;
  department: string | null;
  position: string | null;
}

interface NewHireRule {
  training_type_id: number;
  is_required: boolean;
  is_universal: boolean;
  department: string | null;
  position: string | null;
}

interface NewHireType {
  id: number;
  column_key: string;
}

interface CompletionRow {
  employee_id: string;
  training_type_id: number;
}

export const GET = withApiHandler(async () => {
  const db = createServerClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const cutoff90d = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const cutoff30d = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [complianceSummary, sessionsRes, syncRows, separationTotals] = await Promise.all([
    getComplianceSummary(),
    db
      .from("training_sessions")
      .select("id, session_date, start_time, capacity, training_type_id")
      .eq("status", "scheduled")
      .gte("session_date", todayStr)
      .order("session_date", { ascending: true })
      .limit(8),
    db.from("hub_settings").select("value").eq("type", "sync_log"),
    Promise.all([
      db.from("employees").select("*", { count: "exact", head: true }).eq("is_active", false),
      db
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("is_active", false)
        .gte("terminated_at", cutoff30d),
    ]),
  ]);

  const sessions = (sessionsRes.data ?? []) as SessionRow[];
  const sessionIds = sessions.map((s) => s.id);
  const trainingTypeIds = [...new Set(sessions.map((s) => s.training_type_id))];

  const [enrollmentRes, typeRes, expiredRows, expiringRows, newHireSummary] = await Promise.all([
    sessionIds.length > 0
      ? db
          .from("enrollments")
          .select("session_id")
          .in("session_id", sessionIds)
          .in("status", ["enrolled", "attended"])
      : Promise.resolve({ data: [] as EnrollmentRow[] }),
    trainingTypeIds.length > 0
      ? db.from("training_types").select("id, name").in("id", trainingTypeIds)
      : Promise.resolve({ data: [] as TrainingTypeRow[] }),
    listCompliance({ status: "expired" }),
    listCompliance({ status: "expiring_soon" }),
    buildNewHireSummary(db, cutoff90d),
  ]);

  const enrolledBySession = new Map<string, number>();
  for (const row of (enrollmentRes.data ?? []) as EnrollmentRow[]) {
    enrolledBySession.set(row.session_id, (enrolledBySession.get(row.session_id) ?? 0) + 1);
  }

  const trainingById = new Map<number, string>();
  for (const row of (typeRes.data ?? []) as TrainingTypeRow[]) {
    trainingById.set(row.id, row.name);
  }

  const highlightSessions = sessions.map((session) => ({
    id: session.id,
    training: trainingById.get(session.training_type_id) ?? "Unknown",
    sessionDate: session.session_date,
    startTime: session.start_time,
    enrolledCount: enrolledBySession.get(session.id) ?? 0,
    capacity: session.capacity,
  }));

  const urgent = [...expiredRows, ...expiringRows]
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "expired" ? -1 : 1;
      return (a.expiration_date ?? "").localeCompare(b.expiration_date ?? "");
    })
    .slice(0, 6)
    .map((row) => ({
      employee: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
      training: row.training_name ?? "Unknown",
      status: row.status ?? "needed",
      expirationDate: row.expiration_date ?? null,
    }));

  const parsedLogs = ((syncRows.data ?? []) as Array<{ value: string }>)
    .map((row) => {
      try {
        return JSON.parse(row.value) as SyncLogRow;
      } catch {
        return null;
      }
    })
    .filter((row): row is SyncLogRow => row !== null)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const lastSync = parsedLogs[0] ?? null;
  const stale =
    !lastSync ||
    Date.now() - new Date(lastSync.timestamp).getTime() > 24 * 60 * 60 * 1000;

  const [totalSeparatedRes, separated30dRes] = separationTotals;

  return {
    compliance: {
      totalRows: complianceSummary.total_active_employees,
      current: complianceSummary.status_counts.current,
      expiringSoon: complianceSummary.status_counts.expiring_soon,
      expired: complianceSummary.status_counts.expired,
      needed: complianceSummary.status_counts.needed,
      excused: complianceSummary.status_counts.excused,
    },
    sessions: {
      upcomingCount: sessions.length,
      nextDate: sessions[0]?.session_date ?? null,
    },
    newHires: newHireSummary,
    separations: {
      totalSeparated: totalSeparatedRes.count ?? 0,
      separatedLast30Days: separated30dRes.count ?? 0,
    },
    sync: {
      lastSyncAt: lastSync?.timestamp ?? null,
      stale,
    },
    highlights: {
      topComplianceRisk: urgent,
      nextSessions: highlightSessions,
    },
  };
});

async function buildNewHireSummary(
  db: ReturnType<typeof createServerClient>,
  cutoff90d: string
) {
  const { data: employees } = await db
    .from("employees")
    .select("id, division, department, position")
    .eq("is_active", true)
    .gte("hire_date", cutoff90d);

  const newHires = (employees ?? []) as NewHireRow[];
  if (newHires.length === 0) {
    return { count: 0, avgProgressPct: 0, atRiskCount: 0 };
  }

  const employeeIds = newHires.map((e) => e.id);
  const { data: types } = await db
    .from("training_types")
    .select("id, column_key")
    .eq("is_active", true);
  const { data: rules } = await db
    .from("required_trainings")
    .select("training_type_id, is_required, is_universal, department, position")
    .eq("is_required", true);
  const { data: completions } = await db
    .from("training_records")
    .select("employee_id, training_type_id")
    .in("employee_id", employeeIds);
  const { data: excusals } = await db
    .from("excusals")
    .select("employee_id, training_type_id")
    .in("employee_id", employeeIds);

  const typeKeyById = new Map<number, string>();
  for (const t of (types ?? []) as NewHireType[]) {
    typeKeyById.set(t.id, t.column_key);
  }

  const completedSet = new Set<string>();
  for (const row of (completions ?? []) as CompletionRow[]) {
    const key = typeKeyById.get(row.training_type_id);
    if (!key) continue;
    completedSet.add(`${row.employee_id}|${key}`);
  }
  for (const row of (excusals ?? []) as CompletionRow[]) {
    const key = typeKeyById.get(row.training_type_id);
    if (!key) continue;
    completedSet.add(`${row.employee_id}|${key}`);
  }

  let totalPct = 0;
  let atRiskCount = 0;
  for (const emp of newHires) {
    const division = (emp.division ?? emp.department ?? "").toLowerCase();
    const isBoard = division === "board";
    const requiredTrainingIds = new Set<number>();

    for (const rule of (rules ?? []) as NewHireRule[]) {
      if (!rule.is_required) continue;
      if (rule.is_universal) {
        if (!isBoard) requiredTrainingIds.add(rule.training_type_id);
        continue;
      }
      if (!rule.department) continue;
      if (rule.department.toLowerCase() !== division) continue;
      if (rule.position && emp.position && rule.position.toLowerCase() !== emp.position.toLowerCase()) {
        continue;
      }
      requiredTrainingIds.add(rule.training_type_id);
    }

    let required = 0;
    let completed = 0;
    for (const ttId of requiredTrainingIds) {
      const key = typeKeyById.get(ttId);
      if (!key) continue;
      required += 1;
      if (completedSet.has(`${emp.id}|${key}`)) completed += 1;
    }
    if (required === 0) continue;

    const pct = Math.round((completed / required) * 100);
    totalPct += pct;
    if (completed < required) atRiskCount += 1;
  }

  return {
    count: newHires.length,
    avgProgressPct: Math.round(totalPct / newHires.length),
    atRiskCount,
  };
}
