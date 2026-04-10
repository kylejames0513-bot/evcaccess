import { getEmployeeById, findEmployeeByName, findEmployeeCandidatesByName } from "@/lib/db/employees";
import { getHistoryForEmployee } from "@/lib/db/history";
import { getMasterCompletionsForEmployee } from "@/lib/db/completions";
import { listExcusalsForEmployee } from "@/lib/db/excusals";
import { listCompliance } from "@/lib/db/compliance";
import { listTrainingTypes } from "@/lib/db/trainings";
import type { NextRequest } from "next/server";

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
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const name = req.nextUrl.searchParams.get("name");

    if (!id && !name) {
      return Response.json({ error: "Missing query param: id or name" }, { status: 400 });
    }

    // New id-based path
    if (id) {
      const employee = await getEmployeeById(id);
      if (!employee) {
        return Response.json({ error: `Employee ${id} not found` }, { status: 404 });
      }
      const [history, master, excusals, compliance] = await Promise.all([
        getHistoryForEmployee(id),
        getMasterCompletionsForEmployee(id),
        listExcusalsForEmployee(id),
        employee.is_active ? listCompliance({ employeeId: id }) : Promise.resolve([]),
      ]);
      return Response.json({ employee, history, master_completions: master, excusals, compliance });
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
      return Response.json({ error: `Employee "${name}" not found` }, { status: 404 });
    }

    // Build the old shape the modal expects
    const [history, excusals, allTypes] = await Promise.all([
      getHistoryForEmployee(employee.id),
      listExcusalsForEmployee(employee.id),
      listTrainingTypes({ activeOnly: true }),
    ]);

    const excusalMap = new Map(excusals.map(e => [e.training_type_id, e.reason]));

    // Build per-training entries the modal expects
    const trainings = allTypes.map(tt => {
      const records = history.filter(h => h.training_type_id === tt.id);
      const latest = records[0]; // already sorted desc by completion_date
      const excusalReason = excusalMap.get(tt.id);

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
          else if (daysUntil <= 30) status = "expiring_soon";
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

    return Response.json({
      name: `${employee.first_name} ${employee.last_name}`,
      noShowCount: 0,
      trainings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
