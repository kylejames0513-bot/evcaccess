import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const bodySchema = z.object({
  raw_name: z.string().min(1),
  session: z.string().min(1),
  date: z.string().optional(),
  left_early: z.string().optional().default("No"),
  reason: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  device_info: z.string().optional().default(""),
});

// Session name → training code mapping (mirrors Config.gs SESSION_TO_COLUMN)
const SESSION_TO_CODE: Record<string, string[]> = {
  "CPR": ["CPR_FA"],
  "CPR/FA": ["CPR_FA"],
  "Ukeru": ["UKERU"],
  "UKERU": ["UKERU"],
  "Initial Med Training (4 Days)": ["MED_TRAIN"],
  "Initial Med Class": ["MED_TRAIN"],
  "Med Recert": ["MED_TRAIN", "MED_RECERT"],
  "Post Med": ["POST_MED"],
  "POMs Training": ["POM"],
  "Mealtime": ["MEALTIME"],
  "Person Centered Thinking": ["PERS_CENT_THNK"],
  "Van Lyft Training": ["VR"],
  "Safety Care": ["SAFETY_CARE"],
  "Meaningful Day": ["MEANINGFUL_DAY"],
  "Rights Training": ["RIGHTS_TRAINING"],
  "Title VI": ["TITLE_VI"],
  "Active Shooter": ["ACTIVE_SHOOTER"],
};

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 400 });
  }

  const { raw_name, session, date, left_early, reason, notes, device_info } = parsed.data;
  const arrivalTime = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const today = date || new Date().toISOString().slice(0, 10);

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Try to resolve the employee by name
  const nameParts = raw_name.trim().split(/\s+/);
  let firstName = "";
  let lastName = "";

  if (raw_name.includes(",")) {
    const parts = raw_name.split(",").map(p => p.trim());
    lastName = parts[0];
    firstName = parts.slice(1).join(" ");
  } else if (nameParts.length >= 2) {
    firstName = nameParts[0];
    lastName = nameParts.slice(1).join(" ");
  } else {
    firstName = raw_name.trim();
  }

  // Look up employee
  let employeeId: string | null = null;
  let employeeName = raw_name;

  if (firstName && lastName) {
    const { data: emp } = await supabase
      .from("employees")
      .select("id, legal_first_name, legal_last_name")
      .ilike("legal_last_name", lastName)
      .ilike("legal_first_name", `${firstName}%`)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (emp) {
      employeeId = emp.id;
      employeeName = `${emp.legal_first_name} ${emp.legal_last_name}`;
    } else {
      // Try aliases
      const { data: alias } = await supabase
        .from("name_aliases")
        .select("employee_id")
        .ilike("alias_last", lastName)
        .ilike("alias_first", `${firstName}%`)
        .limit(1)
        .maybeSingle();

      if (alias) {
        employeeId = alias.employee_id;
        const { data: aliasEmp } = await supabase
          .from("employees")
          .select("legal_first_name, legal_last_name")
          .eq("id", alias.employee_id)
          .maybeSingle();
        if (aliasEmp) employeeName = `${aliasEmp.legal_first_name} ${aliasEmp.legal_last_name}`;
      }
    }
  }

  // Write completion to Supabase if employee resolved and we know the training
  const trainingCodes = SESSION_TO_CODE[session] ?? [];
  let completionsCreated = 0;

  if (employeeId && trainingCodes.length > 0) {
    for (const code of trainingCodes) {
      const { data: training } = await supabase
        .from("trainings")
        .select("id")
        .eq("code", code)
        .maybeSingle();

      if (training) {
        await supabase.from("completions").upsert({
          employee_id: employeeId,
          training_id: training.id,
          completed_on: today,
          status: "compliant",
          source: "kiosk_signin",
          notes: `Session: ${session}. ${notes}`.trim(),
        }, {
          onConflict: "employee_id,training_id,completed_on,source",
          ignoreDuplicates: true,
        });
        completionsCreated++;
      }
    }
  }

  // If employee not resolved, add to review queue
  if (!employeeId) {
    await supabase.from("review_queue").insert({
      source: "kiosk_signin",
      reason: "name_not_resolved",
      raw_payload: {
        firstName,
        lastName,
        raw_name,
        session,
        date: today,
        arrivalTime,
        left_early,
        reason,
        notes,
        device_info,
      },
      resolved: false,
    });
  }

  // Write to Google Sheets Training Records via Apps Script doPost
  const appsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (appsScriptUrl) {
    try {
      const params = new URLSearchParams({
        session,
        attendee: employeeName || raw_name,
        date: today,
        leftEarly: left_early ?? "No",
        reason: reason ?? "",
        notes: notes ?? "",
      });
      await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    } catch (sheetErr) {
      console.error("[signin] Google Sheets write failed:", sheetErr);
    }
  }

  return NextResponse.json({
    ok: true,
    resolved: !!employeeId,
    employee: employeeName,
    completions: completionsCreated,
  });
}
