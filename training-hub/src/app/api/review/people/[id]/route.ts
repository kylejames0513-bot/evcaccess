import { resolveUnresolvedPerson } from "@/lib/db/resolution";
import type { NextRequest } from "next/server";

/**
 * POST /api/review/people/[id]
 * Body: { resolved_to_employee_id: string, resolved_by?: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      resolved_to_employee_id: string;
      resolved_by?: string;
    };
    if (!body.resolved_to_employee_id) {
      return Response.json(
        { error: "resolved_to_employee_id is required" },
        { status: 400 }
      );
    }
    const updated = await resolveUnresolvedPerson(
      id,
      body.resolved_to_employee_id,
      body.resolved_by
    );
    return Response.json({ unresolved_person: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
