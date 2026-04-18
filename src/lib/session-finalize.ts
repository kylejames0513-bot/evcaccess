import type { SupabaseClient } from "@supabase/supabase-js";
import { postWriteback } from "@/lib/sheet-writeback";

/**
 * Convert a finalized session's roster into completion rows.
 *
 * Idempotent: uses (employee_id, training_id, completed_on, source) as the
 * conflict key, and stores the session_id on every inserted completion so the
 * class page can show "this completion came from a hub class" later.
 *
 * Rules:
 *   - enrollments with status in (enrolled, confirmed, attended) become
 *     a compliant completion dated session.scheduled_start.
 *   - status = excused → completion with status='exempt', exempt_reason='session_excused'.
 *   - status = no_show → no completion row; we leave the enrollment for reporting.
 *   - status = cancelled → skipped.
 *
 * Returns the number of completions written (inserted or updated).
 */
export async function finalizeSessionCompletions(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ written: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];

  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id, training_id, scheduled_start, session_kind")
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr || !session) {
    errors.push(`session ${sessionId} not found: ${sErr?.message ?? "no row"}`);
    return { written: 0, skipped: 0, errors };
  }

  const completedOn = session.scheduled_start
    ? session.scheduled_start.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const { data: enrolls, error: eErr } = await supabase
    .from("session_enrollments")
    .select("id, employee_id, status")
    .eq("session_id", sessionId);
  if (eErr) {
    errors.push(`enrollments fetch failed: ${eErr.message}`);
    return { written: 0, skipped: 0, errors };
  }

  let written = 0;
  let skipped = 0;

  for (const row of enrolls ?? []) {
    const status = row.status ?? "enrolled";
    if (status === "no_show" || status === "cancelled" || status === "waitlisted") {
      skipped += 1;
      continue;
    }

    const completionStatus = status === "excused" ? "exempt" : "compliant";
    const exemptReason = status === "excused" ? "session_excused" : null;

    const hash = `hub_class:${sessionId}:${row.employee_id}`;

    const { data: inserted, error: cErr } = await supabase
      .from("completions")
      .upsert(
        {
          employee_id: row.employee_id,
          training_id: session.training_id,
          completed_on: completedOn,
          status: completionStatus,
          exempt_reason: exemptReason,
          source: "hub_class",
          source_row_hash: hash,
          session_id: sessionId,
        },
        {
          onConflict: "employee_id,training_id,completed_on,source",
          ignoreDuplicates: false,
        },
      )
      .select("id")
      .maybeSingle();

    if (cErr) {
      errors.push(`completion for ${row.employee_id}: ${cErr.message}`);
      continue;
    }
    if (inserted?.id) {
      // Link the enrollment back to its completion and flag as attended (if
      // the operator hadn't already marked it).
      await supabase
        .from("session_enrollments")
        .update({
          completion_id: inserted.id,
          status: status === "excused" ? "excused" : "attended",
          attendance_marked_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      written += 1;

      // Writeback to the Google Sheet Training tab. Best-effort: the Apps
      // Script handler resolves the employee by id (or name fallback) and
      // writes completedOn into the matching training column. Failures are
      // captured in sync_failures by postWriteback.
      const { data: emp } = await supabase
        .from("employees")
        .select("employee_id, legal_last_name, legal_first_name")
        .eq("id", row.employee_id)
        .maybeSingle();
      const { data: tr } = await supabase
        .from("trainings")
        .select("code")
        .eq("id", session.training_id)
        .maybeSingle();
      if (emp && tr?.code) {
        void postWriteback(
          "completion_upsert",
          {
            employee_employee_id: emp.employee_id,
            last_name: emp.legal_last_name,
            first_name: emp.legal_first_name,
            training_code: tr.code,
            completed_on: completedOn,
            status: completionStatus,
            session_id: sessionId,
          },
          { supabase },
        );
      }
    }
  }

  // For orientation sessions, advance new_hires whose employee_id is on the
  // roster and who are currently in the "orientation" stage. They move to
  // "thirty_day" (first probation milestone per the current template).
  // Also tick their checklist item if the template exposes an orientation key.
  if (session.session_kind === "orientation" && written > 0) {
    const attendedIds = (enrolls ?? [])
      .filter((e) => {
        const s = e.status ?? "enrolled";
        return s !== "no_show" && s !== "cancelled" && s !== "waitlisted";
      })
      .map((e) => e.employee_id);
    if (attendedIds.length > 0) {
      const { data: hires } = await supabase
        .from("new_hires")
        .select("id, employee_id, stage")
        .in("employee_id", attendedIds)
        .eq("stage", "orientation");
      const hireIds = (hires ?? []).map((h) => h.id);
      if (hireIds.length > 0) {
        await supabase
          .from("new_hires")
          .update({
            stage: "thirty_day",
            stage_entry_date: new Date().toISOString().slice(0, 10),
          })
          .in("id", hireIds);
        // Mark any orientation checklist item as completed (idempotent).
        await supabase
          .from("new_hire_checklist")
          .update({
            completed: true,
            completed_on: completedOn,
            completed_by: "hub_class_finalize",
          })
          .in("new_hire_id", hireIds)
          .eq("item_key", "orientation");
      }
    }
  }

  return { written, skipped, errors };
}
