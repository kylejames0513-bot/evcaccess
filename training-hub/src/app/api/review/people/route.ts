import { listUnresolvedPeople } from "@/lib/db/resolution";
import type { NextRequest } from "next/server";

/**
 * GET /api/review/people
 * Query: ?open=true (default), import_id?, source?
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const open = params.get("open") !== "false";
    const importId = params.get("import_id") ?? undefined;
    const source = params.get("source") ?? undefined;
    const rows = await listUnresolvedPeople({ openOnly: open, importId, source });
    return Response.json({ unresolved_people: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
