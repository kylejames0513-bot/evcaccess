// ============================================================
// GET /api/sync/roster — lightweight employee list for VBA macros.
// ============================================================
// Used by the HubSync and PullHireDates macros in the FY Separation
// Summary workbook to build their in-memory name → employee_id map
// once per run. The Monthly New Hire Tracker's PushNewHires macro
// also uses this to decide whether a given name already exists in
// the hub.
//
// Auth: x-hub-sync-token header must match HUB_SYNC_TOKEN.
//
// Query params:
//   include_inactive=true   default false; when set, inactive
//                           employees are returned too (needed by
//                           PullHireDates to backfill historical
//                           separation rows)
//
// Response:
//   {
//     "employees": [
//       {
//         "id": "<uuid>",
//         "first_name": "Jane",
//         "last_name": "Smith",
//         "hire_date": "2024-03-01",
//         "is_active": true,
//         "terminated_at": null,
//         "division": "Residential",
//         "department": "Tiffin",
//         "position": "DSP",
//         "paylocity_id": "SM01"
//       }
//     ]
//   }
// ============================================================

import { withApiHandler, ApiError } from "@/lib/api-handler";
import { requireSyncToken } from "@/lib/sync-auth";
import { createServerClient } from "@/lib/supabase";

export const GET = withApiHandler(async (req) => {
  requireSyncToken(req);

  const params = req.nextUrl.searchParams;
  const includeInactive = params.get("include_inactive") === "true";

  const db = createServerClient();
  const rows: {
    id: string;
    first_name: string;
    last_name: string;
    hire_date: string | null;
    is_active: boolean;
    terminated_at: string | null;
    division: string | null;
    department: string | null;
    position: string | null;
    paylocity_id: string | null;
  }[] = [];

  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    let query = db
      .from("employees")
      .select(
        "id, first_name, last_name, hire_date, is_active, terminated_at, division, department, position, paylocity_id"
      );
    if (!includeInactive) query = query.eq("is_active", true);
    query = query.order("last_name").order("first_name");
    const { data, error } = await query.range(offset, offset + PAGE - 1);
    if (error) {
      throw new ApiError(`failed to read roster: ${error.message}`, 500, "internal");
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return { employees: rows };
});
