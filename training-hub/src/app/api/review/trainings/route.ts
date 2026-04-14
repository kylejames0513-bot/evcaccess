import { listUnknownTrainings } from "@/lib/db/resolution";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/review/trainings
 *
 * Query params (all optional):
 *   open=false                   include resolved rows too (default: open only)
 *   import_id=<uuid>             scope to a single import
 *   source=paylocity|phs|...     scope to a single source
 *   search=<needle>              substring match on raw_name
 *   page=1                       1-based page, default 1
 *   page_size=50                 default 50, max 500
 */
export const GET = withApiHandler(async (req) => {
  const params = req.nextUrl.searchParams;
  const result = await listUnknownTrainings({
    openOnly: params.get("open") !== "false",
    importId: params.get("import_id") ?? undefined,
    source: params.get("source") ?? undefined,
    search: params.get("search") ?? undefined,
    page: params.get("page") ? Number(params.get("page")) : undefined,
    pageSize: params.get("page_size") ? Number(params.get("page_size")) : undefined,
  });
  return {
    unknown_trainings: result.rows,
    total: result.total,
    page: result.page,
    page_size: result.pageSize,
  };
});
