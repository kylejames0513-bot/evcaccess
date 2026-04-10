import { getTrainingTypeById } from "@/lib/db/trainings";
import { getHistoryForTraining } from "@/lib/db/history";
import { listCompliance } from "@/lib/db/compliance";
import type { NextRequest } from "next/server";

/**
 * GET /api/training-detail?id=<training_type_id>
 *
 * Returns the training type plus the full per-training audit trail and
 * the active-employee compliance roster (who has it, who's expired,
 * who's missing).
 */
export async function GET(req: NextRequest) {
  try {
    const idParam = req.nextUrl.searchParams.get("id");
    if (!idParam) {
      return Response.json({ error: "Missing query param: id" }, { status: 400 });
    }
    const id = parseInt(idParam, 10);
    if (Number.isNaN(id)) {
      return Response.json({ error: "id must be a number" }, { status: 400 });
    }
    const training = await getTrainingTypeById(id);
    if (!training) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const [history, compliance] = await Promise.all([
      getHistoryForTraining(id),
      listCompliance({ trainingTypeId: id }),
    ]);
    return Response.json({ training, history, compliance });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
