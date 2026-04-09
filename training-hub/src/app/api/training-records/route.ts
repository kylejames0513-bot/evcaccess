import { createServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServerClient();

    // Query training_records joined with training_types and employees
    // Paginate to bypass 1000-row default cap
    const all: any[] = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from("training_records")
        .select(`
          id, completion_date, source, pass_fail, reviewed_by, notes,
          left_early, reason, arrival_time, end_time, session_length,
          training_types ( name ),
          employees ( first_name, last_name )
        `)
        .order("completion_date", { ascending: false })
        .range(offset, offset + PAGE - 1);

      if (error) throw new Error(`Failed to load training records: ${error.message}`);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
    }

    if (all.length === 0) {
      return Response.json({ records: [], pendingCount: 0, passCount: 0, failCount: 0 });
    }

    const mapped = all.map((rec: any) => {
      const attendee = rec.employees
        ? `${rec.employees.first_name} ${rec.employees.last_name}`.trim()
        : "";
      const session = rec.training_types?.name || "";
      const passFail = rec.pass_fail || "";

      return {
        id: rec.id,
        arrivalTime: rec.arrival_time || "",
        session,
        attendee,
        date: rec.completion_date || "",
        leftEarly: rec.left_early || "",
        reason: rec.reason || "",
        notes: rec.notes || "",
        endTime: rec.end_time || "",
        sessionLength: rec.session_length || "",
        passFail,
        reviewedBy: rec.reviewed_by || "",
      };
    });

    const pendingCount = mapped.filter((r: any) => !r.passFail || r.passFail.toLowerCase() === "pending").length;
    const passCount = mapped.filter((r: any) => r.passFail.toLowerCase() === "pass").length;
    const failCount = mapped.filter((r: any) => r.passFail.toLowerCase() === "fail").length;

    return Response.json({ records: mapped, pendingCount, passCount, failCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ids, reviewedBy } = body;

    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return Response.json(
        { error: "Missing required fields: action, ids (array of record UUIDs)" },
        { status: 400 }
      );
    }

    if (action !== "bulk_pass" && action !== "bulk_fail") {
      return Response.json(
        { error: "action must be 'bulk_pass' or 'bulk_fail'" },
        { status: 400 }
      );
    }

    if (!reviewedBy || typeof reviewedBy !== "string" || !reviewedBy.trim()) {
      return Response.json(
        { error: "reviewedBy is required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const value = action === "bulk_pass" ? "Pass" : "Fail";

    const { error: updateError } = await supabase
      .from("training_records")
      .update({ pass_fail: value, reviewed_by: reviewedBy.trim() })
      .in("id", ids);

    if (updateError) throw new Error(`Failed to update records: ${updateError.message}`);

    return Response.json({
      success: true,
      updated: ids.length,
      action: value,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
