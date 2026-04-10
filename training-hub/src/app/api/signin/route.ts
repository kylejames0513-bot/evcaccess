import { resolveSigninBatch } from "@/lib/resolver";
import { commitPreview } from "@/lib/db/imports";
import { createPreview } from "@/lib/db/imports";
import { batchToPayload } from "@/lib/resolver/types";
import { createServerClient } from "@/lib/supabase";
import type { NextRequest } from "next/server";

/**
 * POST /api/signin
 *
 * Public sign-in endpoint. Runs the resolver, commits immediately,
 * and auto-links the sign-in to an enrolled session if one exists
 * for this training on today's date. Also updates the enrollment
 * status to "attended" and stamps checked_in_at.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (!body.attendeeName || !body.trainingSession) {
      return Response.json(
        { error: "attendeeName and trainingSession are required" },
        { status: 400 }
      );
    }

    const today = (body.dateOfTraining as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const arrivalTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    const batch = await resolveSigninBatch([
      {
        attendeeName: String(body.attendeeName),
        trainingSession: String(body.trainingSession),
        dateOfTraining: today,
        passFail: (body.passFail as string | undefined) ?? null,
        reviewedBy: (body.reviewedBy as string | undefined) ?? null,
        notes: (body.notes as string | undefined) ?? null,
      },
    ]);

    // Inject arrival_time into completions
    for (const c of batch.completions) {
      (c as Record<string, unknown>).arrival_time = arrivalTime;
    }

    const preview = await createPreview({
      source: "signin",
      filename: "public_signin",
      preview_payload: batchToPayload(batch),
      rows_in: batch.rows_in,
      rows_added: batch.rows_added_estimate,
      rows_unresolved: batch.unresolved_people.length,
      rows_unknown: batch.unknown_trainings.length,
    });

    await commitPreview(preview.id);

    // Auto-link to enrolled session: find a scheduled session for this
    // training on today's date and mark the employee as checked in
    if (batch.completions.length > 0) {
      const db = createServerClient();
      const employeeId = batch.completions[0].employee_id;
      const trainingTypeId = batch.completions[0].training_type_id;

      // Find matching session
      const { data: sessions } = await db
        .from("training_sessions")
        .select("id")
        .eq("training_type_id", trainingTypeId)
        .eq("session_date", today)
        .eq("status", "scheduled")
        .limit(1);

      if (sessions && sessions.length > 0) {
        const sessionId = sessions[0].id;

        // Check if they're enrolled
        const { data: enrollment } = await db
          .from("enrollments")
          .select("id")
          .eq("session_id", sessionId)
          .eq("employee_id", employeeId)
          .maybeSingle();

        if (enrollment) {
          // Update existing enrollment: mark checked in
          await db.from("enrollments").update({
            checked_in_at: new Date().toISOString(),
            status: "attended" as const,
          }).eq("id", enrollment.id);
        } else {
          // Walk-in: create enrollment
          await db.from("enrollments").insert({
            session_id: sessionId,
            employee_id: employeeId,
            status: "attended" as const,
            checked_in_at: new Date().toISOString(),
          });
        }

        // Also link the training_record to this session
        await db.from("training_records")
          .update({ session_id: sessionId })
          .eq("employee_id", employeeId)
          .eq("training_type_id", trainingTypeId)
          .eq("completion_date", today)
          .is("session_id", null);
      }
    }

    return Response.json({
      committed: true,
      added: batch.rows_added_estimate,
      unresolved: batch.unresolved_people.length,
      unknown: batch.unknown_trainings.length,
      message:
        batch.rows_added_estimate > 0
          ? "Sign in recorded."
          : "We could not match your name. HR has been notified and will resolve.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
