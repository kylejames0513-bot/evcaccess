import { getImport, commitPreview, deletePreview, failImport } from "@/lib/db/imports";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";
import type { NextRequest } from "next/server";

/**
 * GET /api/imports/[id]
 * Returns the import row plus its preview_payload for the imports UI.
 */
export const GET = withApiHandler(async (_req: NextRequest, ctx) => {
  const params = await ctx!.params;
  const row = await getImport(params.id);
  if (!row) {
    throw new ApiError("Import not found", 404, "not_found");
  }
  return { import: row };
});

/**
 * POST /api/imports/[id]
 * Body: { action: 'commit' | 'fail', error?: string }
 * commit  -> calls commit_import RPC, flips status to committed
 * fail    -> stamps failed with error message (used when the resolver
 *            crashed during preview)
 */
export const POST = withApiHandler(async (req: NextRequest, ctx) => {
  await requireHrCookie();
  const params = await ctx!.params;
  const body = (await req.json()) as { action: string; error?: string };
  if (body.action === "commit") {
    const updated = await commitPreview(params.id);
    return { import: updated };
  }
  if (body.action === "fail") {
    const updated = await failImport(params.id, body.error ?? "Unknown failure");
    return { import: updated };
  }
  throw new ApiError(`Unknown action: ${body.action}`, 400, "invalid_field");
});

/**
 * DELETE /api/imports/[id]
 * Removes a preview-status import. Committed imports cannot be deleted.
 */
export const DELETE = withApiHandler(async (_req: NextRequest, ctx) => {
  await requireHrCookie();
  const params = await ctx!.params;
  await deletePreview(params.id);
  return { ok: true };
});
