import { createServerClient } from "@/lib/supabase";
import { listCompliance, fixSharedColumnKeyCompliance } from "@/lib/db/compliance";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { endOfNextCalendarQuarter } from "@/lib/quarter";
import { withApiHandler, ApiError } from "@/lib/api-handler";

/**
 * GET /api/needs-training?training=<name>
 *
 * Returns employees who need the given training (to populate the
 * scheduler Auto-Fill). Uses the compliance view + shared-column_key
 * logic so position-level rules and Initial Med → Med Recert are
 * both honored.
 *
 * Priority order: expired > expiring_soon > needed, then most overdue
 * within each status.
 */
export const GET = withApiHandler(async (request) => {
  const trainingName = request.nextUrl.searchParams.get("training");
  if (!trainingName) {
    throw new ApiError("Missing query param: training", 400, "missing_field");
  }

  const supabase = createServerClient();

  // 1. Find the training type by name (or alias via training_aliases)
  const { data: typeByName } = await supabase
    .from("training_types")
    .select("id, name, column_key, renewal_years, is_active")
    .ilike("name", trainingName)
    .eq("is_active", true);

  let trainingType = typeByName?.[0];

  if (!trainingType) {
    // Fallback: use TRAINING_DEFINITIONS to map name → column_key
    const fallbackDef = TRAINING_DEFINITIONS.find(
      (d) => d.name.toLowerCase() === trainingName.toLowerCase() ||
        d.aliases?.some((a) => a.toLowerCase() === trainingName.toLowerCase())
    );
    if (fallbackDef) {
      const { data: byKey } = await supabase
        .from("training_types")
        .select("id, name, column_key, renewal_years, is_active")
        .eq("column_key", fallbackDef.columnKey)
        .eq("is_active", true)
        .order("renewal_years", { ascending: false })
        .limit(1);
      trainingType = byKey?.[0];
    }
  }

  if (!trainingType) {
    return { employees: [] };
  }

  // Look-ahead config from TRAINING_DEFINITIONS (if defined)
  const def = TRAINING_DEFINITIONS.find((d) => d.columnKey === trainingType.column_key);
  const lookAheadDays = def?.lookAheadDays ?? 30;
  const postExpGraceDays = def?.postExpGraceDays ?? 0;

  // Is this the "recert" side of a paired Initial → Recert training?
  // If so, we should exclude people who have no prior completion since
  // they need the Initial class, not the Recert class.
  let isRecertHalf = false;
  if (trainingType.renewal_years > 0) {
    const { data: siblings } = await supabase
      .from("training_types")
      .select("id, renewal_years")
      .eq("column_key", trainingType.column_key)
      .eq("is_active", true);
    if ((siblings ?? []).some((s) => s.id !== trainingType.id && s.renewal_years === 0)) {
      isRecertHalf = true;
    }
  }

  // 2. Fetch compliance rows for this training type, post-process for shared column_key
  const rawRows = await listCompliance({ trainingTypeId: trainingType.id });
  const fixed = await fixSharedColumnKeyCompliance(rawRows);

  // 3. Filter to people who actually need the training
  const today = new Date();
  // Quarterly trainings (e.g. Med Recert) look ahead through the end of the
  // next calendar quarter instead of a fixed day window, so the current
  // quarter's class catches everyone whose cert expires before the next one.
  const lookAheadDate = def?.lookAheadNextQuarterEnd
    ? endOfNextCalendarQuarter(today)
    : (() => {
        const d = new Date(today);
        d.setDate(d.getDate() + lookAheadDays);
        return d;
      })();
  const graceDate = new Date(today);
  graceDate.setDate(graceDate.getDate() - postExpGraceDays);

  const employees = fixed
    .filter((row) => {
      if (!row.employee_id) return false;
      if (row.status === "excused") return false;
      if (row.status === "needed") {
        // Recert-half trainings: "needed" means they've never had any prior
        // med completion. They belong in the Initial Med class, not Recert.
        if (isRecertHalf) return false;
        return true;
      }
      if (row.status === "expired") {
        if (postExpGraceDays === 0) return true;
        if (!row.expiration_date) return true;
        return new Date(row.expiration_date) >= graceDate;
      }
      if (row.status === "expiring_soon") return true;
      if (row.status === "current" && row.expiration_date) {
        // Within look-ahead window
        return new Date(row.expiration_date) <= lookAheadDate;
      }
      return false;
    })
    .map((row) => {
      let daysExpired = 0;
      let daysUntilExpiry = 0;
      if (row.expiration_date) {
        const exp = new Date(row.expiration_date);
        const diffMs = today.getTime() - exp.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffMs > 0) daysExpired = Math.max(diffDays, 0);
        else daysUntilExpiry = Math.max(-diffDays, 0);
      } else if (row.status === "needed") {
        daysExpired = 9999;
      }
      return {
        name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
        employeeId: row.employee_id ?? "",
        status: row.status ?? "needed",
        daysExpired,
        daysUntilExpiry,
        division: row.department ?? "",
        position: row.position ?? "",
      };
    });

  // 4. Sort: worst status first, then most overdue within each status
  const statusRank: Record<string, number> = { expired: 0, expiring_soon: 1, current: 2, needed: 3 };
  employees.sort((a, b) => {
    const ra = statusRank[a.status] ?? 4;
    const rb = statusRank[b.status] ?? 4;
    if (ra !== rb) return ra - rb;
    if (a.status === "expired") return b.daysExpired - a.daysExpired;
    if (a.status === "expiring_soon" || a.status === "current") return a.daysUntilExpiry - b.daysUntilExpiry;
    return a.name.localeCompare(b.name);
  });

  return { employees };
});
