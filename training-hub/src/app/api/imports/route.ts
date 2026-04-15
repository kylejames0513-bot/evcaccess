import {
  createImportPreview,
  type CreateImportInput,
} from "@/lib/resolver";
import { listImports } from "@/lib/db/imports";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireHrCookie } from "@/lib/auth/hr-session";

// ── Upload guardrails ──────────────────────────────────────────────────
// Enforce limits at the API boundary so a runaway file can't waste memory
// or hit Vercel's request size cap. These mirror the client-side checks
// in /imports/page.tsx — we validate on both sides because the client
// is untrusted.
const MAX_ROWS = 50_000;
const ALLOWED_SOURCES = ["paylocity", "phs", "access", "signin"] as const;
type AllowedSource = (typeof ALLOWED_SOURCES)[number];

function isAllowedSource(s: unknown): s is AllowedSource {
  return typeof s === "string" && (ALLOWED_SOURCES as readonly string[]).includes(s);
}

/**
 * GET /api/imports
 * Returns the run log, newest first. Optional ?status= filter.
 */
export const GET = withApiHandler(async (req) => {
  const status = req.nextUrl.searchParams.get("status") as never;
  const limit = req.nextUrl.searchParams.get("limit");
  const rows = await listImports({
    status: status || undefined,
    limit: limit ? parseInt(limit, 10) || 50 : 50,
  });
  return { imports: rows };
});

/**
 * POST /api/imports
 * Body: { source: 'paylocity'|'phs'|'access'|'signin', filename?, rows: [...] }
 *
 * Validates:
 *   • source is one of the four known source names
 *   • rows is a non-empty array
 *   • row count is under MAX_ROWS (50k)
 *   • every row is a plain object (not a primitive or array)
 *
 * Returns the import id and a summary so the UI can render the diff.
 */
export const POST = withApiHandler(async (req) => {
  await requireHrCookie();
  const body = (await req.json()) as CreateImportInput;

  if (!isAllowedSource(body.source)) {
    throw new ApiError(
      `source must be one of: ${ALLOWED_SOURCES.join(", ")}`,
      400,
      "invalid_field"
    );
  }
  if (!Array.isArray(body.rows)) {
    throw new ApiError("rows must be an array", 400, "invalid_field");
  }
  if (body.rows.length === 0) {
    throw new ApiError("rows is empty — nothing to import", 400, "bad_request");
  }
  if (body.rows.length > MAX_ROWS) {
    throw new ApiError(
      `rows.length ${body.rows.length} exceeds maximum of ${MAX_ROWS}. ` +
        `Split the file into smaller batches.`,
      413,
      "payload_too_large"
    );
  }
  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new ApiError(
        `rows[${i}] is not an object`,
        400,
        "invalid_field"
      );
    }
  }

  const result = await createImportPreview(body);
  return {
    import_id: result.import.id,
    summary: {
      rows_in: result.batch.rows_in,
      rows_added_estimate: result.batch.rows_added_estimate,
      rows_skipped_estimate: result.batch.rows_skipped_estimate,
      unresolved_count: result.batch.unresolved_people.length,
      unknown_count: result.batch.unknown_trainings.length,
      rehired_count: result.batch.rehired_count,
    },
  };
});
