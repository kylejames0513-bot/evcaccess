import type { SupabaseClient } from "@supabase/supabase-js";

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
    .select("id, training_id, scheduled_start")
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
    }
  }

  return { written, skipped, errors };
}
