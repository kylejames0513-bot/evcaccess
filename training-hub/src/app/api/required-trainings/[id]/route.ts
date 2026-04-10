import {
  getRequiredTrainingById,
  updateRequiredTraining,
  deleteRequiredTraining,
} from "@/lib/db/requirements";
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId)) return Response.json({ error: "Invalid id" }, { status: 400 });
    const row = await getRequiredTrainingById(numId);
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ required_training: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId)) return Response.json({ error: "Invalid id" }, { status: 400 });
    const patch = await req.json();
    const updated = await updateRequiredTraining(numId, patch);
    return Response.json({ required_training: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId)) return Response.json({ error: "Invalid id" }, { status: 400 });
    await deleteRequiredTraining(numId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
