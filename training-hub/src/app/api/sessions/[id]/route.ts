import { createServerClient } from "@/lib/supabase";
import type { NextRequest } from "next/server";

/**
 * GET /api/sessions/[id]
 *
 * Returns the session with training name, all enrollees with their
 * employee info and enrollment status, and any matching sign-in
 * records (training_records with source='signin' for that date+training).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const db = createServerClient();

    // Fetch session
    const { data: session, error: sErr } = await db
      .from("training_sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (sErr) throw sErr;
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

    // Training name
    const { data: tt } = await db
      .from("training_types")
      .select("id, name, column_key, renewal_years")
      .eq("id", session.training_type_id)
      .single();

    // Enrollees with employee info
    const { data: enrollments } = await db
      .from("enrollments")
      .select("id, employee_id, status, checked_in_at, completed_at, score, notes")
      .eq("session_id", id);

    const empIds = (enrollments ?? []).map(e => e.employee_id);
    const { data: employees } = empIds.length > 0
      ? await db.from("employees").select("id, first_name, last_name, paylocity_id, department").in("id", empIds)
      : { data: [] };
    const empMap = new Map((employees ?? []).map(e => [e.id, e]));

    // Sign-in records for this date + training (auto-matched or manual)
    const { data: signins } = await db
      .from("training_records")
      .select("id, employee_id, completion_date, source, pass_fail, notes, arrival_time")
      .eq("training_type_id", session.training_type_id)
      .eq("completion_date", session.session_date);

    type SigninRow = NonNullable<typeof signins>[number];
    const signinByEmployee = new Map<string, SigninRow>();
    for (const s of signins ?? []) {
      signinByEmployee.set(s.employee_id, s);
    }

    // Build enrollee list with sign-in cross-reference
    const enrolleeList = (enrollments ?? []).map(enrollment => {
      const emp = empMap.get(enrollment.employee_id);
      const signin = signinByEmployee.get(enrollment.employee_id);
      return {
        enrollment_id: enrollment.id,
        employee_id: enrollment.employee_id,
        first_name: emp?.first_name ?? "",
        last_name: emp?.last_name ?? "",
        paylocity_id: emp?.paylocity_id ?? null,
        department: emp?.department ?? null,
        enrollment_status: enrollment.status, // enrolled, attended, passed, failed, no_show, cancelled
        checked_in_at: enrollment.checked_in_at,
        signed_in: !!signin, // did they use the sign-in form?
        signin_time: signin?.arrival_time ?? null,
        signin_record_id: signin?.id ?? null,
        pass_fail: signin?.pass_fail ?? enrollment.score ?? null,
        notes: enrollment.notes ?? signin?.notes ?? null,
      };
    });

    // Find walk-ins: people who signed in but weren't enrolled
    const enrolledEmpIds = new Set(empIds);
    const walkIns = (signins ?? [])
      .filter(s => !enrolledEmpIds.has(s.employee_id))
      .map(s => {
        const emp = employees?.find(e => e.id === s.employee_id);
        return {
          employee_id: s.employee_id,
          first_name: emp?.first_name ?? "Unknown",
          last_name: emp?.last_name ?? "",
          signed_in: true,
          signin_time: s.arrival_time,
          signin_record_id: s.id,
          pass_fail: s.pass_fail,
          notes: s.notes,
        };
      });

    // Next session of the same type (for no-show suggestions)
    const { data: nextSessions } = await db
      .from("training_sessions")
      .select("id, session_date, start_time, location")
      .eq("training_type_id", session.training_type_id)
      .eq("status", "scheduled")
      .gt("session_date", session.session_date)
      .order("session_date", { ascending: true })
      .limit(3);

    return Response.json({
      session: {
        ...session,
        training_name: tt?.name ?? "Unknown",
        training_type: tt,
      },
      enrollees: enrolleeList,
      walk_ins: walkIns,
      next_sessions: nextSessions ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/sessions/[id]
 *
 * Actions:
 *   { action: "review", attendees: [{ employee_id, status, pass_fail, notes }] }
 *     - Updates enrollment statuses
 *     - For "passed": ensures a training_record exists with the session date
 *     - For "no_show": flags the enrollment, does NOT create a training_record
 *     - For "failed": flags but no completion record
 *
 *   { action: "archive" }
 *     - Sets session status to "completed"
 *
 *   { action: "reopen" }
 *     - Sets session status back to "scheduled"
 *
 *   { action: "add_to_session", employee_id, target_session_id }
 *     - Enrolls a no-show into the next available session
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const db = createServerClient();

    if (body.action === "review") {
      const attendees = body.attendees as Array<{
        employee_id: string;
        enrollment_id?: string;
        status: "passed" | "failed" | "no_show" | "attended" | "cancelled";
        pass_fail?: string;
        notes?: string;
      }>;

      // Get session info for the training_record
      const { data: session } = await db
        .from("training_sessions")
        .select("training_type_id, session_date")
        .eq("id", id)
        .single();
      if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

      for (const att of attendees) {
        // Update enrollment status
        if (att.enrollment_id) {
          await db.from("enrollments").update({
            status: att.status,
            score: att.pass_fail ?? null,
            notes: att.notes ?? null,
            completed_at: ["passed", "attended"].includes(att.status) ? new Date().toISOString() : null,
          }).eq("id", att.enrollment_id);
        }

        // For passed/attended: ensure a training_record exists
        if (att.status === "passed" || att.status === "attended") {
          await db.from("training_records").upsert({
            employee_id: att.employee_id,
            training_type_id: session.training_type_id,
            completion_date: session.session_date,
            session_id: id,
            source: "session",
            pass_fail: att.pass_fail ?? "Pass",
            notes: att.notes ?? null,
          }, { onConflict: "employee_id,training_type_id,completion_date" });
        }

        // For failed: update existing training_record if one exists from sign-in
        if (att.status === "failed") {
          await db.from("training_records")
            .update({ pass_fail: "Fail", notes: att.notes ?? null })
            .eq("employee_id", att.employee_id)
            .eq("training_type_id", session.training_type_id)
            .eq("completion_date", session.session_date);
        }

        // For no_show: remove any training_record for this session
        // (in case they signed in but then were marked no-show)
        if (att.status === "no_show") {
          await db.from("training_records")
            .delete()
            .eq("employee_id", att.employee_id)
            .eq("training_type_id", session.training_type_id)
            .eq("completion_date", session.session_date)
            .eq("source", "signin");
        }
      }

      return Response.json({ ok: true, reviewed: attendees.length });
    }

    if (body.action === "archive") {
      await db.from("training_sessions")
        .update({ status: "completed" as const })
        .eq("id", id);
      return Response.json({ ok: true, status: "completed" });
    }

    if (body.action === "reopen") {
      await db.from("training_sessions")
        .update({ status: "scheduled" as const })
        .eq("id", id);
      return Response.json({ ok: true, status: "scheduled" });
    }

    if (body.action === "add_to_session") {
      const { employee_id, target_session_id } = body;
      await db.from("enrollments").insert({
        session_id: target_session_id,
        employee_id,
        status: "enrolled" as const,
      });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
