import { getEmployeeById, findEmployeeByName, findEmployeeCandidatesByName } from "@/lib/db/employees";
import { getHistoryForEmployee } from "@/lib/db/history";
import { getMasterCompletionsForEmployee } from "@/lib/db/completions";
import { listExcusalsForEmployee } from "@/lib/db/excusals";
import { listCompliance, fixSharedColumnKeyCompliance } from "@/lib/db/compliance";
import { listTrainingTypes } from "@/lib/db/trainings";
import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

/**
 * GET /api/employee-detail?id=<uuid> OR ?name=<full name>
 *
 * Supports both the new id-based lookup (from /employees/[id]) and
 * the legacy name-based lookup (from EmployeeDetailModal).
 *
 * When using name, returns the old shape the modal expects:
 *   { name, noShowCount, trainings: [...] }
 *
 * When using id, returns the new shape:
 *   { employee, history, master_completions, excusals, compliance }
 */
export const GET = withApiHandler(async (req) => {
  const id = req.nextUrl.searchParams.get("id");
  const name = req.nextUrl.searchParams.get("name");

  if (!id && !name) {
    throw new ApiError("Missing query param: id or name", 400, "missing_field");
  }

  // New id-based path
  if (id) {
    const employee = await getEmployeeById(id);
    if (!employee) {
      throw new ApiError(`Employee ${id} not found`, 404, "not_found");
    }
    const [history, master, excusals, rawCompliance] = await Promise.all([
      getHistoryForEmployee(id),
      getMasterCompletionsForEmployee(id),
      listExcusalsForEmployee(id),
      employee.is_active ? listCompliance({ employeeId: id }) : Promise.resolve([]),
    ]);
    const compliance = await fixSharedColumnKeyCompliance(rawCompliance);
    return { employee, history, master_completions: master, excusals, compliance };
  }

    // Legacy name-based path for the EmployeeDetailModal
    // Try "First Last" and "Last, First" formats
    const nameParts = name!.includes(",")
      ? name!.split(",").map(s => s.trim())
      : name!.split(/\s+/);

    let employee = null;
    if (nameParts.length >= 2) {
      if (name!.includes(",")) {
        // "Last, First"
        employee = await findEmployeeByName(nameParts[0], nameParts[1]);
      } else {
        // "First Last"
        const first = nameParts[0];
        const last = nameParts.slice(1).join(" ");
        employee = await findEmployeeByName(last, first);
      }
    }

    // Fallback: try all candidates
    if (!employee && nameParts.length >= 2) {
      let candidates;
      if (name!.includes(",")) {
        candidates = await findEmployeeCandidatesByName(nameParts[0], nameParts[1]);
      } else {
        candidates = await findEmployeeCandidatesByName(nameParts.slice(1).join(" "), nameParts[0]);
      }
      if (candidates.length === 1) employee = candidates[0];
    }

  if (!employee) {
    throw new ApiError(`Employee "${name}" not found`, 404, "not_found");
  }

    // Build the old shape the modal expects, but ONLY for required trainings
    const db = createServerClient();
    const { data: rules, error: rulesErr } = await db
      .from("required_trainings")
      .select("*")
      .eq("is_required", true);
    if (rulesErr) {
      throw new ApiError(`failed to read required_trainings: ${rulesErr.message}`, 500, "internal");
    }

    // Determine which training_type_ids are required for this employee.
    // Use canonical division (employees.division → fallback employees.department)
    // so the rules match the same way the compliance view does. Board
    // members are excluded from universal rules but still pick up any
    // explicit Board-scoped rules below.
    const canonicalDivision = String(
      employee.division ?? employee.department ?? ""
    ).trim();
    const isBoard = canonicalDivision.toLowerCase() === "board";
    const requiredTypeIds = new Set<number>();
    for (const rule of rules ?? []) {
      if (rule.is_universal) {
        if (!isBoard) requiredTypeIds.add(rule.training_type_id);
      } else if (rule.department && canonicalDivision &&
        rule.department.toLowerCase() === canonicalDivision.toLowerCase()) {
        if (rule.position == null) {
          requiredTypeIds.add(rule.training_type_id);
        } else if (employee.position && rule.position.toLowerCase() === employee.position.toLowerCase()) {
          requiredTypeIds.add(rule.training_type_id);
        }
      }
    }

    const [history, excusals, allTypes] = await Promise.all([
      getHistoryForEmployee(employee.id),
      listExcusalsForEmployee(employee.id),
      listTrainingTypes({ activeOnly: true }),
    ]);

    // Index excusals by column_key so an excusal on a sibling
    // training_type (e.g. Initial Med Training) satisfies a sibling
    // requirement (Med Recert). Same logic as the compliance view's
    // LATERAL excusal join.
    const ttById = new Map(allTypes.map((t) => [t.id, t]));
    const excusalByColumnKey = new Map<string, string>();
    for (const e of excusals) {
      const tt = ttById.get(e.training_type_id);
      if (!tt) continue;
      if (!excusalByColumnKey.has(tt.column_key)) {
        excusalByColumnKey.set(tt.column_key, e.reason);
      }
    }

    // Only show trainings required for this employee
    const requiredTypes = allTypes.filter(tt => requiredTypeIds.has(tt.id));
    const trainings = requiredTypes.map(tt => {
      // Match completions by column_key as well so Initial Med satisfies
      // Med Recert and vice versa.
      const records = history.filter(
        (h) =>
          h.training_type_id === tt.id ||
          (h.training_type_id != null && ttById.get(h.training_type_id)?.column_key === tt.column_key)
      );
      const latest = records[0]; // already sorted desc by completion_date
      const excusalReason = excusalByColumnKey.get(tt.column_key);

      let status = "needed";
      if (excusalReason) {
        status = "excused";
      } else if (latest) {
        if (tt.renewal_years === 0) {
          status = "current";
        } else if (latest.expiration_date) {
          const exp = new Date(latest.expiration_date);
          const now = new Date();
          const daysUntil = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntil < 0) status = "expired";
          // expiring_soon = within 90 days, matches compliance view v3
          // (migration 20260414000200_compliance_view_expiring_90_days).
          else if (daysUntil <= 90) status = "expiring_soon";
          else status = "current";
        } else {
          status = "current";
        }
      }

      return {
        columnKey: tt.column_key,
        value: excusalReason ?? (latest?.completion_date ?? ""),
        date: latest?.completion_date ?? null,
        status,
        isExcused: !!excusalReason,
        enrolledIn: null,
        openSessions: [],
      };
    });

  return {
    name: `${employee.first_name} ${employee.last_name}`,
    noShowCount: 0,
    trainings,
  };
});
