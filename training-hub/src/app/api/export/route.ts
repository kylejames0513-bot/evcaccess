import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

/**
 * GET /api/export?type=employees|history|compliance
 *
 * Returns CSV data as a downloadable file.
 *
 * - employees: all employees (active + terminated) with their info
 * - history: every employee with every training record (one row per completion)
 * - compliance: active employees with their required training statuses
 */
export const GET = withApiHandler(async (req) => {
  const type = req.nextUrl.searchParams.get("type") ?? "history";
    const db = createServerClient();

    let csv = "";
    let filename = "";

    if (type === "employees") {
      const { data: employees, error } = await db
        .from("employees")
        .select("*")
        .order("last_name")
        .order("first_name");
      if (error) throw new ApiError(`export query failed: ${error.message}`, 500, "internal");

      const headers = [
        "Paylocity ID",
        "Last Name",
        "First Name",
        "Status",
        "Division",
        "Department",
        "Position",
        "Job Title",
        "Hire Date",
        "Terminated",
      ];
      csv = headers.join(",") + "\n";
      for (const e of employees ?? []) {
        csv += [
          esc(e.paylocity_id ?? e.employee_number ?? ""),
          esc(e.last_name),
          esc(e.first_name),
          e.is_active ? "Active" : "Terminated",
          esc(e.division ?? ""),
          esc(e.department ?? ""),
          esc(e.position ?? ""),
          esc(e.job_title ?? ""),
          e.hire_date ?? "",
          e.terminated_at ? e.terminated_at.slice(0, 10) : "",
        ].join(",") + "\n";
      }
      filename = `evc_employees_${today()}.csv`;

    } else if (type === "history") {
      // Full training history: one row per (employee, training, completion)
      const { data: rows, error } = await db
        .from("employee_history")
        .select("*")
        .order("last_name")
        .order("first_name")
        .order("completion_date", { ascending: false });
      if (error) throw new ApiError(`export query failed: ${error.message}`, 500, "internal");

      const headers = [
        "Paylocity ID", "Last Name", "First Name", "Active", "Department",
        "Training", "Completion Date", "Expiration Date", "Source",
        "Pass/Fail", "Reviewed By", "Notes",
      ];
      csv = headers.join(",") + "\n";
      for (const r of rows ?? []) {
        csv += [
          esc(r.paylocity_id ?? ""),
          esc(r.last_name ?? ""),
          esc(r.first_name ?? ""),
          r.is_active ? "Active" : "Terminated",
          esc(r.department ?? ""),
          esc(r.training_name ?? ""),
          r.completion_date ?? "",
          r.expiration_date ?? "",
          r.source ?? "",
          r.pass_fail ?? "",
          esc(r.reviewed_by ?? ""),
          esc(r.notes ?? ""),
        ].join(",") + "\n";
      }
      filename = `evc_training_history_${today()}.csv`;

    } else if (type === "compliance") {
      const { data: rows, error } = await db
        .from("employee_compliance")
        .select("*")
        .order("last_name")
        .order("first_name");
      if (error) throw new ApiError(`export query failed: ${error.message}`, 500, "internal");

      const headers = [
        "Paylocity ID", "Last Name", "First Name", "Division", "Department", "Position",
        "Training", "Status", "Completion Date", "Expiration Date",
        "Days Overdue", "Source",
      ];
      csv = headers.join(",") + "\n";
      for (const r of rows ?? []) {
        csv += [
          esc(r.paylocity_id ?? ""),
          esc(r.last_name ?? ""),
          esc(r.first_name ?? ""),
          esc(r.division ?? ""),
          esc(r.department ?? ""),
          esc(r.position ?? ""),
          esc(r.training_name ?? ""),
          r.status ?? "",
          r.completion_date ?? "",
          r.expiration_date ?? "",
          r.days_overdue ?? "",
          r.completion_source ?? "",
        ].join(",") + "\n";
      }
      filename = `evc_compliance_${today()}.csv`;

  } else {
    throw new ApiError("type must be employees, history, or compliance", 400, "invalid_field");
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

function esc(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
