import { listUnresolvedPeople } from "@/lib/db/resolution";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/review/people
 *
 * Query params (all optional):
 *   open=false                   include resolved rows too (default: open only)
 *   import_id=<uuid>             scope to a single import
 *   source=paylocity|phs|...     scope to a single source
 *   reason=no_match|ambiguous|...
 *   search=<needle>              substring match on name / paylocity_id
 *   page=1                       1-based page, default 1
 *   page_size=50                 default 50, max 500
 *
 * Response shape:
 *   { unresolved_people: Row[], total: number, page: number, page_size: number }
 */
export const GET = withApiHandler(async (req) => {
  const params = req.nextUrl.searchParams;
  const result = await listUnresolvedPeople({
    openOnly: params.get("open") !== "false",
    importId: params.get("import_id") ?? undefined,
    source: params.get("source") ?? undefined,
    reason: params.get("reason") ?? undefined,
    search: params.get("search") ?? undefined,
    page: params.get("page") ? Number(params.get("page")) : undefined,
    pageSize: params.get("page_size") ? Number(params.get("page_size")) : undefined,
  });
  return {
    unresolved_people: result.rows,
    total: result.total,
    page: result.page,
    page_size: result.pageSize,
  };
});
