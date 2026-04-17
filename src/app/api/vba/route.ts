/**
 * VBA bridge endpoint — called from the Monthly New Hire Tracker XLSM
 * and the compliance workbook macros.
 *
 * GET actions:
 *   getTrainings?firstName&lastName             — training completions for an employee
 *   getEmployee?firstName&lastName              — employee lookup (up to 10 matches)
 *   listTrainings                               — all active training codes
 *   pullOnboardingStatus?month=YYYY-MM&section  — new-hire onboarding status for the
 *                                                 tracker's monthly sheet. section is
 *                                                 "new_hire" or "transfer". Returns the
 *                                                 CPR / Ukeru / Mealtime / Med Cert
 *                                                 completion dates for each hire in that
 *                                                 month, formatted so the macro can write
 *                                                 "Yes" + date comment, or "" when blank.
 *
 * POST actions (JSON body with { action, ... }):
 *   addNewHire         — legacy, still used
 *   logCompletion      — legacy, still used
 *   pushNewHire        — new: recruiter row from tracker → hub. Upserts new_hires
 *                        (match by last+first+hireMonth+hireYear), seeds checklist.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

  if (action === "getTrainings") {
    return await handleGetTrainings(supabase, params);
  }

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

  if (action === "listTrainings") {
    const { data } = await supabase
      .from("trainings")
      .select("code, title, cadence_type, cadence_months")
      .eq("active", true)
      .order("code");

    return NextResponse.json({ trainings: data ?? [] });
  }

  if (action === "pullOnboardingStatus") {
    return await handlePullOnboardingStatus(supabase, params);
  }

  if (action === "getOnboarding") {
    return await handleGetOnboarding(supabase, params);
  }

  return NextResponse.json(
    { error: "Unknown action. Use: getTrainings, getEmployee, listTrainings, pullOnboardingStatus, getOnboarding" },
    { status: 400 },
  );
}

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

  if (action === "addNewHire" || action === "pushNewHire") {
    return await handlePushNewHire(supabase, body);
  }

  if (action === "logCompletion") {
    return await handleLogCompletion(supabase, body);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// =========================================================
// Handlers
// =========================================================

async function handleGetTrainings(supabase: SupabaseClient, params: URLSearchParams) {
  const firstName = (params.get("firstName") ?? "").trim();
  const lastName = (params.get("lastName") ?? "").trim();
  const employeeId = (params.get("employeeId") ?? "").trim();

  if (!firstName && !lastName && !employeeId) {
    return NextResponse.json({ error: "Provide firstName+lastName or employeeId" }, { status: 400 });
  }

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

  const { data: completions } = await supabase
    .from("completions")
    .select("training_id, completed_on, expires_on, status, exempt_reason")
    .eq("employee_id", empId)
    .order("completed_on", { ascending: false });

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code, title");

  const trMap = new Map((trainings ?? []).map((t) => [t.id, t]));

  const seen = new Set<string>();
  const result: Record<string, { status: string; date: string | null; expires: string | null }> = {};

  for (const c of completions ?? []) {
    const tr = trMap.get(c.training_id);
    if (!tr || seen.has(tr.code)) continue;
    seen.add(tr.code);
    result[tr.code] = {
      status:
        c.status === "exempt"
          ? c.exempt_reason ?? "N/A"
          : c.status === "compliant"
            ? "Yes"
            : c.status,
      date: c.completed_on,
      expires: c.expires_on,
    };
  }

  return NextResponse.json({ employee_id: empId, trainings: result });
}

async function handleLogCompletion(supabase: SupabaseClient, body: Record<string, unknown>) {
  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const trainingCode = String(body.trainingCode ?? "").trim();
  const completedOn = String(body.date ?? "").trim();
  const status = String(body.status ?? "compliant").trim();

  if (!firstName || !lastName || !trainingCode) {
    return NextResponse.json({ error: "firstName, lastName, trainingCode required" }, { status: 400 });
  }

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .ilike("legal_last_name", lastName)
    .ilike("legal_first_name", `${firstName}%`)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { data: tr } = await supabase
    .from("trainings")
    .select("id")
    .eq("code", trainingCode)
    .maybeSingle();

  if (!tr) return NextResponse.json({ error: `Training ${trainingCode} not found` }, { status: 404 });

  const { error } = await supabase.from("completions").upsert(
    {
      employee_id: emp.id,
      training_id: tr.id,
      completed_on: completedOn || new Date().toISOString().slice(0, 10),
      status:
        status === "N/A" || status === "exempt"
          ? "exempt"
          : status === "No" || status === "failed"
            ? "failed"
            : "compliant",
      exempt_reason: status === "N/A" ? "N/A" : null,
      source: "vba_tracker",
    },
    { onConflict: "employee_id,training_id,completed_on,source", ignoreDuplicates: true },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function handlePushNewHire(supabase: SupabaseClient, body: Record<string, unknown>) {
  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  if (!firstName || !lastName) {
    return NextResponse.json({ error: "firstName and lastName required" }, { status: 400 });
  }

  const hireType = (String(body.hireType ?? body.section ?? "new_hire").trim().toLowerCase() === "transfer")
    ? "transfer"
    : "new_hire";

  const hireMonth = String(body.month ?? body.hireMonth ?? "").trim() || null;
  const hireYear = body.year ? Number(body.year) : body.hireYear ? Number(body.hireYear) : null;

  const row = {
    legal_first_name: firstName,
    legal_last_name: lastName,
    department: String(body.department ?? "").trim() || null,
    position: String(body.position ?? "").trim() || null,
    location_title: String(body.locationTitle ?? body.location ?? "").trim() || null,
    offer_accepted_date: String(body.dateOfHire ?? body.doh ?? body.hireDate ?? "").trim() || null,
    planned_start_date: String(body.startDate ?? "").trim() || null,
    hire_type: hireType,
    is_residential: toBool(body.isResidential ?? body.residential),
    lift_van_required: toBool(body.liftVanRequired ?? body.liftVan),
    new_job_desc_required: toBool(body.newJobDescRequired ?? body.newJobDesc),
    background_check: String(body.backgroundCheck ?? body.bkgrd ?? "").trim() || null,
    hire_month: hireMonth,
    hire_year: hireYear,
    ingest_source: "vba_tracker",
  };

  // Match by name + hire month/year to avoid duplicates from re-pushes.
  const match = supabase
    .from("new_hires")
    .select("id")
    .ilike("legal_last_name", lastName)
    .ilike("legal_first_name", firstName);
  const { data: existing } = hireMonth && hireYear
    ? await match.eq("hire_month", hireMonth).eq("hire_year", hireYear).maybeSingle()
    : await match.maybeSingle();

  let hireId: string;
  if (existing?.id) {
    const { error } = await supabase.from("new_hires").update(row).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    hireId = existing.id;
  } else {
    const { data, error } = await supabase.from("new_hires").insert({ ...row, stage: "offer_accepted" }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    hireId = data.id;
  }

  // Seed the checklist from the template. Duplicate-safe: items are keyed by item_key.
  await seedChecklistRows(supabase, hireId);

  return NextResponse.json({ ok: true, id: hireId, hireType, action: existing ? "updated" : "inserted" });
}

async function seedChecklistRows(supabase: SupabaseClient, hireId: string) {
  const { data: hire } = await supabase
    .from("new_hires")
    .select("hire_type, is_residential, lift_van_required, new_job_desc_required")
    .eq("id", hireId)
    .maybeSingle();
  if (!hire) return;

  const { templateFor } = await import("@/lib/onboarding-templates");
  const template = templateFor(hire as Parameters<typeof templateFor>[0]);

  const { data: existing } = await supabase
    .from("new_hire_checklist")
    .select("item_key")
    .eq("new_hire_id", hireId);
  const have = new Set((existing ?? []).map((r) => r.item_key).filter(Boolean));

  const toInsert = template
    .filter((t) => !have.has(t.key))
    .map((t) => ({
      new_hire_id: hireId,
      item_key: t.key,
      item_name: t.label,
      kind: t.kind,
      required: t.kind === "required",
      completed: false,
      stage: "onboarding",
    }));

  if (toInsert.length > 0) {
    await supabase.from("new_hire_checklist").insert(toInsert);
  }
}

// Map onboarding item_key → tracker column name
const TRACKER_COLUMN_MAP: Record<string, string> = {
  cpr: "cpr",
  ukeru: "ukeru",
  mealtime: "mealtime",
  med_cert: "medCert",
  lift_van: "liftVan",
};

async function handlePullOnboardingStatus(supabase: SupabaseClient, params: URLSearchParams) {
  const month = (params.get("month") ?? "").trim(); // e.g. "2026-04" or "April"
  const sectionRaw = (params.get("section") ?? "").trim().toLowerCase();
  const section = sectionRaw === "transfer" ? "transfer" : "new_hire";

  let query = supabase
    .from("new_hires")
    .select(
      "id, legal_last_name, legal_first_name, preferred_name, hire_type, hire_month, hire_year",
    )
    .eq("hire_type", section);

  if (month) {
    // Accept "YYYY-MM" or a bare month name ("April").
    const ym = month.match(/^(\d{4})-(\d{2})$/);
    if (ym) {
      const year = Number(ym[1]);
      const monthIdx = Number(ym[2]);
      const monthName = new Date(year, monthIdx - 1, 1).toLocaleString("en-US", { month: "long" });
      query = query.eq("hire_year", year).eq("hire_month", monthName);
    } else {
      query = query.eq("hire_month", month);
    }
  }

  const { data: hires, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hireIds = (hires ?? []).map((h) => h.id);
  if (hireIds.length === 0) return NextResponse.json({ hires: [] });

  const { data: items } = await supabase
    .from("new_hire_checklist")
    .select("new_hire_id, item_key, completed, completed_on")
    .in("new_hire_id", hireIds);

  const byHire = new Map<string, Record<string, { completed: boolean; date: string | null }>>();
  for (const it of items ?? []) {
    if (!it.item_key) continue;
    const bucket = byHire.get(it.new_hire_id) ?? {};
    bucket[it.item_key] = { completed: Boolean(it.completed), date: it.completed_on };
    byHire.set(it.new_hire_id, bucket);
  }

  const out = (hires ?? []).map((h) => {
    const status = byHire.get(h.id) ?? {};
    const row: Record<string, unknown> = {
      lastName: h.legal_last_name,
      firstName: h.legal_first_name,
      preferredName: h.preferred_name,
    };
    for (const [key, col] of Object.entries(TRACKER_COLUMN_MAP)) {
      const entry = status[key];
      row[col] = entry?.completed ? entry.date ?? "Yes" : null;
    }
    return row;
  });

  return NextResponse.json({ section, month: month || null, hires: out });
}

async function handleGetOnboarding(supabase: SupabaseClient, params: URLSearchParams) {
  const firstName = (params.get("firstName") ?? "").trim();
  const lastName = (params.get("lastName") ?? "").trim();
  if (!firstName || !lastName) {
    return NextResponse.json({ error: "firstName and lastName required" }, { status: 400 });
  }

  const { data: hire } = await supabase
    .from("new_hires")
    .select("id")
    .ilike("legal_last_name", lastName)
    .ilike("legal_first_name", `${firstName}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!hire) return NextResponse.json({ ok: false, found: false });

  const { data: items } = await supabase
    .from("new_hire_checklist")
    .select("item_key, completed, completed_on")
    .eq("new_hire_id", hire.id);

  const out: Record<string, string | null> = {};
  for (const col of Object.values(TRACKER_COLUMN_MAP)) out[col] = null;
  for (const row of items ?? []) {
    if (!row.item_key || !TRACKER_COLUMN_MAP[row.item_key]) continue;
    out[TRACKER_COLUMN_MAP[row.item_key]] = row.completed ? row.completed_on ?? "Yes" : null;
  }

  return NextResponse.json({ ok: true, found: true, ...out });
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "yes" || s === "y" || s === "1";
  }
  return false;
}
