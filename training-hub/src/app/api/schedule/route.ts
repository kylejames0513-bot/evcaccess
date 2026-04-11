import { getScheduledSessions } from "@/lib/training-data";
import { createServerClient } from "@/lib/supabase";
import { listCompliance, fixSharedColumnKeyCompliance } from "@/lib/db/compliance";

/**
 * Auto-prune enrolled people who no longer need the training.
 * Runs on every schedule page load. If someone completed their
 * certification since being enrolled, they get removed from
 * upcoming sessions automatically.
 */
async function pruneCurrentEnrollees() {
  const supabase = createServerClient();

  // Get all upcoming scheduled sessions
  const { data: sessions, error: sessErr } = await supabase
    .from("training_sessions")
    .select("id, training_type_id")
    .eq("status", "scheduled");
  if (sessErr || !sessions || sessions.length === 0) return 0;

  const sessionIds = sessions.map((s) => s.id);
  const sessionTypeMap = new Map<string, number>();
  for (const s of sessions) sessionTypeMap.set(s.id, s.training_type_id);

  // Get active enrollments for these sessions
  const { data: enrollments, error: enrErr } = await supabase
    .from("enrollments")
    .select("id, session_id, employee_id, status")
    .in("session_id", sessionIds)
    .not("status", "in", '("cancelled","no_show")');
  if (enrErr || !enrollments || enrollments.length === 0) return 0;

  // Get compliance data
  const rawCompliance = await listCompliance();
  const compliance = await fixSharedColumnKeyCompliance(rawCompliance);

  // Build lookup: employee_id|training_type_id → compliance status
  const complianceMap = new Map<string, string>();
  for (const row of compliance) {
    if (row.employee_id && row.training_type_id) {
      complianceMap.set(`${row.employee_id}|${row.training_type_id}`, row.status ?? "current");
    }
  }

  // Find enrollees who are now "current" or "excused"
  const toRemove: string[] = [];
  for (const enrollment of enrollments) {
    const ttId = sessionTypeMap.get(enrollment.session_id);
    if (!ttId) continue;
    const key = `${enrollment.employee_id}|${ttId}`;
    const status = complianceMap.get(key);
    if (status === "current" || status === "excused") {
      toRemove.push(enrollment.id);
    }
  }

  if (toRemove.length > 0) {
    await supabase.from("enrollments").delete().in("id", toRemove);
  }

  return toRemove.length;
}

export async function GET() {
  try {
    // Prune people who completed their training before loading
    await pruneCurrentEnrollees();

    const sessions = await getScheduledSessions();
    return Response.json({ sessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
