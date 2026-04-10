import {
  createImportPreview,
  type CreateImportInput,
} from "@/lib/resolver";
import { listImports } from "@/lib/db/imports";
import type { NextRequest } from "next/server";

/**
 * GET /api/imports
 * Returns the run log, newest first. Optional ?status= filter.
 */
export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status") as never;
    const limit = req.nextUrl.searchParams.get("limit");
    const rows = await listImports({
      status: status || undefined,
      limit: limit ? (parseInt(limit, 10) || 50) : 50,
    });
    return Response.json({ imports: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/imports
 * Body: { source: 'paylocity'|'phs'|'access'|'signin', filename?, rows: [...] }
 * Runs the parser, persists a preview row, returns the import id and the
 * resolved batch summary so the UI can render the diff.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateImportInput;
    if (!body.source || !Array.isArray(body.rows)) {
      return Response.json(
        { error: "Body must include {source, rows: []}" },
        { status: 400 }
      );
    }
    const result = await createImportPreview(body);
    return Response.json({
      import_id: result.import.id,
      summary: {
        rows_in: result.batch.rows_in,
        rows_added_estimate: result.batch.rows_added_estimate,
        rows_skipped_estimate: result.batch.rows_skipped_estimate,
        unresolved_count: result.batch.unresolved_people.length,
        unknown_count: result.batch.unknown_trainings.length,
        rehired_count: result.batch.rehired_count,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
