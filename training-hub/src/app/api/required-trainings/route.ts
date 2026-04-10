import {
  listRequiredTrainings,
  insertRequiredTraining,
} from "@/lib/db/requirements";
import type { NextRequest } from "next/server";

/**
 * GET /api/required-trainings
 * Returns every rule, ordered universal -> dept -> position.
 */
export async function GET() {
  try {
    const rows = await listRequiredTrainings();
    return Response.json({ required_trainings: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/required-trainings
 * Body: { training_type_id: number, department?: string, position?: string,
 *         is_required?: boolean, is_universal?: boolean, notes?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const inserted = await insertRequiredTraining(body);
    return Response.json({ required_training: inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
