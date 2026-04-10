import { resolveSigninBatch } from "@/lib/resolver";
import { commitPreview } from "@/lib/db/imports";
import { createPreview } from "@/lib/db/imports";
import { batchToPayload } from "@/lib/resolver/types";
import type { NextRequest } from "next/server";

/**
 * POST /api/signin
 *
 * Public endpoint for the in-app sign-in form. Body:
 *   {
 *     attendeeName: string,
 *     trainingSession: string,
 *     dateOfTraining?: string,
 *     passFail?: string,
 *     reviewedBy?: string,
 *     notes?: string
 *   }
 *
 * Runs the signin parser, persists a preview row, and immediately
 * commits it. Returns the resolution outcome so the form can show
 * "training recorded for X" or "we could not match your name, please
 * see HR".
 *
 * No auth: this is the public sign-in page, replacement for the old
 * Google Form. RLS on imports/training_records is the safety net here;
 * the route uses the service role key but only writes the one row from
 * the request body.
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

    const batch = await resolveSigninBatch([
      {
        attendeeName: String(body.attendeeName),
        trainingSession: String(body.trainingSession),
        dateOfTraining: (body.dateOfTraining as string | undefined) ?? new Date().toISOString().slice(0, 10),
        passFail: (body.passFail as string | undefined) ?? null,
        reviewedBy: (body.reviewedBy as string | undefined) ?? null,
        notes: (body.notes as string | undefined) ?? null,
      },
    ]);

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
