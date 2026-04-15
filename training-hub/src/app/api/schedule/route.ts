import { getScheduledSessions } from "@/lib/training-data";
import { createServerClient } from "@/lib/supabase";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { endOfNextCalendarQuarter } from "@/lib/quarter";
import { withApiHandler } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import { toLocalYmd } from "@/lib/date-ymd";
import { isRosterAutomationLocked } from "@/lib/roster-lock";

/**
 * Auto-prune enrolled people who no longer need the training.
 * Runs on every schedule page load. Only removes people whose
 * cert will STILL be valid at the session date + look-ahead buffer.
 * Someone whose CPR expires 45 days after the session date stays
 * enrolled (they need the class). Someone whose CPR expires 2 years
 * after the session date gets removed (they don't need it).
 *
 * Sessions are skipped when {@link isRosterAutomationLocked} is true: either
 * `roster_manual_lock` on the row, or session_date within the two-week window.
 */
async function pruneCurrentEnrollees() {
  const supabase = createServerClient();
  const todayYmd = toLocalYmd(new Date());

  // Get all upcoming scheduled sessions with their dates and training types
  const { data: sessions, error: sessErr } = await supabase
    .from("training_sessions")
    .select("id, training_type_id, session_date, roster_manual_lock")
    .eq("status", "scheduled");
  if (sessErr || !sessions || sessions.length === 0) return 0;

  const sessionIds = sessions.map((s) => s.id);

  // Get active enrollments for these sessions
  const { data: enrollments, error: enrErr } = await supabase
    .from("enrollments")
    .select("id, session_id, employee_id, status")
    .in("session_id", sessionIds)
    .not("status", "in", '("cancelled","no_show")');
  if (enrErr || !enrollments || enrollments.length === 0) return 0;

  // Load training types for look-ahead info
  const { data: trainingTypes } = await supabase
    .from("training_types")
    .select("id, name, column_key, renewal_years");
  const typeById = new Map(
    (trainingTypes ?? []).map((t) => [t.id, t])
  );

  // Load all training_records for the enrolled employees + relevant training types
  const employeeIds = [...new Set(enrollments.map((e) => e.employee_id))];
  const neededTypeIds = [...new Set(sessions.map((s) => s.training_type_id))];
  // Expand neededTypeIds to include sibling types (same column_key) so Initial Med satisfies Med Recert
  const columnKeysNeeded = new Set(neededTypeIds.map((id) => typeById.get(id)?.column_key).filter(Boolean));
  const allRelevantTypeIds = (trainingTypes ?? [])
    .filter((t) => columnKeysNeeded.has(t.column_key))
    .map((t) => t.id);

  const { data: records } = await supabase
    .from("training_records")
    .select("employee_id, training_type_id, completion_date, expiration_date")
    .in("employee_id", employeeIds)
    .in("training_type_id", allRelevantTypeIds)
    .order("completion_date", { ascending: false });

  // Build lookup: employee_id|column_key → latest (completion_date, expiration_date)
  const latestByEmpKey = new Map<string, { completion_date: string; expiration_date: string | null }>();
  for (const rec of records ?? []) {
    const colKey = typeById.get(rec.training_type_id)?.column_key;
    if (!colKey) continue;
    const key = `${rec.employee_id}|${colKey}`;
    if (!latestByEmpKey.has(key)) {
      latestByEmpKey.set(key, {
        completion_date: rec.completion_date,
        expiration_date: rec.expiration_date,
      });
    }
  }

  // Decide who to remove
  const toRemove: string[] = [];
  for (const enrollment of enrollments) {
    const session = sessions.find((s) => s.id === enrollment.session_id);
    if (!session) continue;
    const manual = Boolean((session as { roster_manual_lock?: boolean }).roster_manual_lock);
    if (isRosterAutomationLocked(todayYmd, session.session_date as string, manual)) {
      continue;
    }
    const trainingType = typeById.get(session.training_type_id);
    if (!trainingType) continue;

    // Look up the training definition for look-ahead info
    const def = TRAINING_DEFINITIONS.find(
      (d) => d.columnKey === trainingType.column_key
    );
    const lookAheadDays = def?.lookAheadDays ?? 30;

    const key = `${enrollment.employee_id}|${trainingType.column_key}`;
    const latest = latestByEmpKey.get(key);

    // If they have no completion at all → they need the class, keep them
    if (!latest || !latest.completion_date) continue;

    // One-and-done (renewal_years=0) and they have a completion → remove them
    if (trainingType.renewal_years === 0) {
      toRemove.push(enrollment.id);
      continue;
    }

    // Compute their expiration (from the required type's renewal period)
    const completionDate = new Date(latest.completion_date);
    const expiration = new Date(completionDate);
    expiration.setFullYear(expiration.getFullYear() + trainingType.renewal_years);

    // Session date + look-ahead buffer: if their expiration is AFTER this,
    // they don't need this class (their cert will still be valid).
    // Quarterly trainings (Med Recert) use "end of next calendar quarter"
    // as the buffer so anyone expiring before the next quarter's class stays.
    const sessionDate = new Date(session.session_date);
    const bufferEnd = def?.lookAheadNextQuarterEnd
      ? endOfNextCalendarQuarter(sessionDate)
      : (() => {
          const d = new Date(sessionDate);
          d.setDate(d.getDate() + lookAheadDays);
          return d;
        })();

    if (expiration > bufferEnd) {
      // Their cert is valid well past the class → remove
      toRemove.push(enrollment.id);
    }
    // Otherwise: their cert is expiring near or before the class → keep enrolled
  }

  if (toRemove.length > 0) {
    await supabase.from("enrollments").delete().in("id", toRemove);
  }

  return toRemove.length;
}

export const GET = withApiHandler(async () => {
  await requireHrCookie();
  // Prune people who completed their training before loading
  await pruneCurrentEnrollees();

  const sessions = await getScheduledSessions();
  return { sessions };
});
