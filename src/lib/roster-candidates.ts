import type { SupabaseClient } from "@supabase/supabase-js";

export type CandidateEmployee = {
  id: string;
  employee_id: string;
  legal_first_name: string;
  legal_last_name: string;
  preferred_name: string | null;
  department: string | null;
  location: string | null;
  position: string | null;
  supervisor_name_raw: string | null;
  last_completed_on: string | null;
  expires_on: string | null;
  days_until_expiry: number | null;
};

export type CandidateBucket = {
  key: "overdue" | "due_soon" | "never" | "new_hire";
  label: string;
  hint: string;
  members: CandidateEmployee[];
};

export type RosterCandidates = {
  buckets: CandidateBucket[];
  totalAvailable: number;
};

/**
 * Builds the "who could we add to this class?" panels.
 *
 * Reads from the `vw_compliance_status` view (one row per active employee per
 * active training) and filters by the current training_id. Excludes anyone
 * already enrolled in the session.
 *
 * For orientation-kind sessions, pulls from `new_hires` (stage=orientation)
 * instead of the general compliance bucket.
 */
export async function getRosterCandidates(opts: {
  supabase: SupabaseClient;
  trainingId: string;
  alreadyEnrolled: Set<string>;
  sessionKind: string;
}): Promise<RosterCandidates> {
  const { supabase, trainingId, alreadyEnrolled, sessionKind } = opts;

  const buckets: CandidateBucket[] = [];

  // Compliance view — one pass, bucketed client-side.
  const { data: statusRows } = await supabase
    .from("vw_compliance_status")
    .select(
      "employee_id, paylocity_id, legal_first_name, legal_last_name, department, position, completed_on, expires_on, days_until_expiry, compliance_status",
    )
    .eq("training_id", trainingId);

  // Extra employee fields not on the view
  const ids = (statusRows ?? [])
    .map((r) => r.employee_id)
    .filter((v): v is string => Boolean(v))
    .filter((id) => !alreadyEnrolled.has(id));

  const empExtrasMap = new Map<
    string,
    { preferred_name: string | null; location: string | null; supervisor_name_raw: string | null }
  >();
  if (ids.length > 0) {
    const { data: emps } = await supabase
      .from("employees")
      .select("id, preferred_name, location, supervisor_name_raw")
      .in("id", ids);
    for (const e of emps ?? []) empExtrasMap.set(e.id, e);
  }

  const overdue: CandidateEmployee[] = [];
  const dueSoon: CandidateEmployee[] = [];
  const never: CandidateEmployee[] = [];

  for (const r of statusRows ?? []) {
    if (!r.employee_id || alreadyEnrolled.has(r.employee_id)) continue;
    const extras = empExtrasMap.get(r.employee_id) ?? {
      preferred_name: null,
      location: null,
      supervisor_name_raw: null,
    };
    const c: CandidateEmployee = {
      id: r.employee_id,
      employee_id: r.paylocity_id ?? "",
      legal_first_name: r.legal_first_name ?? "",
      legal_last_name: r.legal_last_name ?? "",
      preferred_name: extras.preferred_name,
      department: r.department ?? null,
      location: extras.location,
      position: r.position ?? null,
      supervisor_name_raw: extras.supervisor_name_raw,
      last_completed_on: r.completed_on ?? null,
      expires_on: r.expires_on ?? null,
      days_until_expiry: r.days_until_expiry ?? null,
    };
    const status = r.compliance_status ?? "";
    if (status === "overdue") overdue.push(c);
    else if (status === "due_soon") dueSoon.push(c);
    else if (status === "never_completed") never.push(c);
  }

  if (overdue.length > 0) {
    buckets.push({
      key: "overdue",
      label: `Overdue (${overdue.length})`,
      hint: "Past the renewal deadline.",
      members: sortByName(overdue),
    });
  }
  if (dueSoon.length > 0) {
    buckets.push({
      key: "due_soon",
      label: `Due soon (${dueSoon.length})`,
      hint: "Expires within 30 days.",
      members: sortByName(dueSoon),
    });
  }
  if (never.length > 0) {
    buckets.push({
      key: "never",
      label: `Never completed (${never.length})`,
      hint: "Required by role/department, no record yet.",
      members: sortByName(never),
    });
  }

  if (sessionKind === "orientation") {
    // Pull new hires in the orientation stage who haven't been enrolled.
    const { data: hires } = await supabase
      .from("new_hires")
      .select(
        "id, employee_id, legal_first_name, legal_last_name, preferred_name, department, location_title, position, supervisor_name_raw, stage",
      )
      .eq("stage", "orientation")
      .limit(200);

    const newHireEmployeeIds = (hires ?? [])
      .map((h) => h.employee_id)
      .filter((v): v is string => Boolean(v));

    const nhEmpExtras = new Map<string, { location: string | null }>();
    if (newHireEmployeeIds.length > 0) {
      const { data: emps } = await supabase
        .from("employees")
        .select("id, location")
        .in("id", newHireEmployeeIds);
      for (const e of emps ?? []) nhEmpExtras.set(e.id, e);
    }

    const members: CandidateEmployee[] = [];
    for (const h of hires ?? []) {
      if (!h.employee_id) continue; // can only enroll once linked to an employee
      if (alreadyEnrolled.has(h.employee_id)) continue;
      const extras = nhEmpExtras.get(h.employee_id) ?? { location: null };
      members.push({
        id: h.employee_id,
        employee_id: "",
        legal_first_name: h.legal_first_name ?? "",
        legal_last_name: h.legal_last_name ?? "",
        preferred_name: h.preferred_name ?? null,
        department: h.department ?? null,
        location: extras.location ?? h.location_title ?? null,
        position: h.position ?? null,
        supervisor_name_raw: h.supervisor_name_raw ?? null,
        last_completed_on: null,
        expires_on: null,
        days_until_expiry: null,
      });
    }

    if (members.length > 0) {
      buckets.unshift({
        key: "new_hire",
        label: `New hires in orientation (${members.length})`,
        hint: "Currently in the orientation stage.",
        members: sortByName(members),
      });
    }
  }

  const totalAvailable = buckets.reduce((n, b) => n + b.members.length, 0);
  return { buckets, totalAvailable };
}

function sortByName(rows: CandidateEmployee[]): CandidateEmployee[] {
  return [...rows].sort((a, b) => {
    const la = a.legal_last_name.toLowerCase();
    const lb = b.legal_last_name.toLowerCase();
    if (la !== lb) return la.localeCompare(lb);
    return a.legal_first_name.localeCompare(b.legal_first_name);
  });
}
