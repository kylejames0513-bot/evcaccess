/**
 * GET /api/vba?action=getTrainings&firstName=John&lastName=Smith
 * GET /api/vba?action=getEmployee&firstName=John&lastName=Smith
 * POST /api/vba?action=addNewHire (body: JSON new hire data)
 *
 * Called from VBA in the Monthly New Hire Tracker XLSM.
 * Returns JSON that VBA can parse to populate training columns.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const action = params.get("action") ?? "";

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  // Get training completions for an employee
  if (action === "getTrainings") {
    const firstName = (params.get("firstName") ?? "").trim();
    const lastName = (params.get("lastName") ?? "").trim();
    const employeeId = (params.get("employeeId") ?? "").trim();

    if (!firstName && !lastName && !employeeId) {
      return NextResponse.json({ error: "Provide firstName+lastName or employeeId" }, { status: 400 });
    }

    // Find employee
    let empId: string | null = null;
    if (employeeId) {
      const { data } = await supabase.from("employees").select("id").eq("employee_id", employeeId).maybeSingle();
      empId = data?.id ?? null;
    }
    if (!empId && firstName && lastName) {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .ilike("legal_last_name", lastName)
        .ilike("legal_first_name", `${firstName}%`)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      empId = data?.id ?? null;
    }

    if (!empId) {
      return NextResponse.json({ error: "Employee not found", trainings: {} });
    }

    // Get all completions for this employee
    const { data: completions } = await supabase
      .from("completions")
      .select("training_id, completed_on, expires_on, status, exempt_reason")
      .eq("employee_id", empId)
      .order("completed_on", { ascending: false });

    // Get training codes
    const { data: trainings } = await supabase
      .from("trainings")
      .select("id, code, title");

    const trMap = new Map((trainings ?? []).map(t => [t.id, t]));

    // Build result: code → { status, date, expires }
    // Only return the latest completion per training
    const seen = new Set<string>();
    const result: Record<string, { status: string; date: string | null; expires: string | null }> = {};

    for (const c of completions ?? []) {
      const tr = trMap.get(c.training_id);
      if (!tr || seen.has(tr.code)) continue;
      seen.add(tr.code);
      result[tr.code] = {
        status: c.status === "exempt" ? (c.exempt_reason ?? "N/A") : c.status === "compliant" ? "Yes" : c.status,
        date: c.completed_on,
        expires: c.expires_on,
      };
    }

    return NextResponse.json({ employee_id: empId, trainings: result });
  }

  // Get employee info
  if (action === "getEmployee") {
    const firstName = (params.get("firstName") ?? "").trim();
    const lastName = (params.get("lastName") ?? "").trim();

    const { data } = await supabase
      .from("employees")
      .select("id, employee_id, legal_first_name, legal_last_name, position, department, location, status, hire_date")
      .ilike("legal_last_name", lastName || "%")
      .ilike("legal_first_name", firstName ? `${firstName}%` : "%")
      .eq("status", "active")
      .limit(10);

    return NextResponse.json({ employees: data ?? [] });
  }

  // List all training codes (for VBA to map columns)
  if (action === "listTrainings") {
    const { data } = await supabase
      .from("trainings")
      .select("code, title, cadence_type, cadence_months")
      .eq("active", true)
      .order("code");

    return NextResponse.json({ trainings: data ?? [] });
  }

  return NextResponse.json({ error: "Unknown action. Use: getTrainings, getEmployee, listTrainings" }, { status: 400 });
}

// POST: add a new hire from VBA
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");

  if (action === "addNewHire") {
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    if (!firstName || !lastName) {
      return NextResponse.json({ error: "firstName and lastName required" }, { status: 400 });
    }

    const { data, error } = await supabase.from("new_hires").insert({
      legal_first_name: firstName,
      legal_last_name: lastName,
      department: String(body.department ?? "").trim() || null,
      position: String(body.position ?? "").trim() || null,
      planned_start_date: String(body.startDate ?? "").trim() || null,
      offer_accepted_date: String(body.hireDate ?? "").trim() || null,
      stage: "offer_accepted",
      ingest_source: "vba_tracker",
      hire_month: String(body.month ?? "").trim() || null,
      hire_year: body.year ? Number(body.year) : null,
    }).select("id").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  // Log a training completion from VBA
  if (action === "logCompletion") {
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const trainingCode = String(body.trainingCode ?? "").trim();
    const completedOn = String(body.date ?? "").trim();
    const status = String(body.status ?? "compliant").trim();

    if (!firstName || !lastName || !trainingCode) {
      return NextResponse.json({ error: "firstName, lastName, trainingCode required" }, { status: 400 });
    }

    // Resolve employee
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .ilike("legal_last_name", lastName)
      .ilike("legal_first_name", `${firstName}%`)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    // Resolve training
    const { data: tr } = await supabase
      .from("trainings")
      .select("id")
      .eq("code", trainingCode)
      .maybeSingle();

    if (!tr) return NextResponse.json({ error: `Training ${trainingCode} not found` }, { status: 404 });

    const { error } = await supabase.from("completions").upsert({
      employee_id: emp.id,
      training_id: tr.id,
      completed_on: completedOn || new Date().toISOString().slice(0, 10),
      status: status === "N/A" || status === "exempt" ? "exempt" : status === "No" || status === "failed" ? "failed" : "compliant",
      exempt_reason: status === "N/A" ? "N/A" : null,
      source: "vba_tracker",
    }, { onConflict: "employee_id,training_id,completed_on,source", ignoreDuplicates: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
