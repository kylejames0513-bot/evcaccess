import { getImport, commitPreview, deletePreview, failImport } from "@/lib/db/imports";
import type { NextRequest } from "next/server";

/**
 * GET /api/imports/[id]
 * Returns the import row plus its preview_payload for the imports UI.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const row = await getImport(id);
    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ import: row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/imports/[id]
 * Body: { action: 'commit' | 'fail', error?: string }
 * commit  -> calls commit_import RPC, flips status to committed
 * fail    -> stamps failed with error message (used when the resolver
 *            crashed during preview)
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { action: string; error?: string };
    if (body.action === "commit") {
      const updated = await commitPreview(id);
      return Response.json({ import: updated });
    }
    if (body.action === "fail") {
      const updated = await failImport(id, body.error ?? "Unknown failure");
      return Response.json({ import: updated });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/imports/[id]
 * Removes a preview-status import. Committed imports cannot be deleted.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await deletePreview(id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
