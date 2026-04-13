import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";
import {
  getManagersByDepartment,
  type ManagerRow,
} from "@/lib/db/managers";
import { getCurrentHrUser } from "@/lib/auth/current-user";
import type { NextRequest } from "next/server";

// ============================================================
// GET /api/sessions/[id]/memo
// ============================================================
// Builds a class-memo draft for the given scheduled session. Returns
// both the structured data (so the UI can render a pretty preview)
// and a pre-formatted text body that HR can paste into an email.
//
// Memo includes:
//   • Training name, date, time, location
//   • Attendee list (active enrollments only) grouped by department
//   • "Please forward to" list: managers/directors for each
//     department represented in the enrollment roster
//
// We do NOT actually send email. Delivery is out of scope (would
// need Resend/SendGrid + a verified sender domain). HR copies the
// generated memo to clipboard and pastes it into their own email
// client. This keeps the feature simple and deployable today.
// ============================================================

interface EnrollmentJoin {
  status: string;
  employees: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    department: string | null;
    position: string | null;
    job_title: string | null;
    email: string | null;
    paylocity_id: string | null;
  } | null;
}

interface SessionJoin {
  id: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  capacity: number;
  notes: string | null;
  training_types: { name: string; renewal_years: number } | null;
}

export const GET = withApiHandler(async (_req: NextRequest, ctx) => {
  const params = await ctx!.params;
  const sessionId = params.id;

  const db = createServerClient();

  // Resolve the signed-in HR user so we can sign the memo with their
  // name + title (or "Human Resources" for shared-password sessions).
  const currentUser = await getCurrentHrUser();

  // 1. Load the session + training name
  const { data: session, error: sessErr } = await db
    .from("training_sessions")
    .select(
      "id, session_date, start_time, end_time, location, capacity, notes, training_types(name, renewal_years)"
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (sessErr) throw sessErr;
  if (!session) throw new ApiError("Session not found", 404, "not_found");
  const typedSession = session as unknown as SessionJoin;
  const trainingName = typedSession.training_types?.name ?? "Training";

  // 2. Load enrollments + joined employee info, excluding cancelled rows.
  const { data: enrollments, error: enrErr } = await db
    .from("enrollments")
    .select(
      "status, employees(id, first_name, last_name, department, position, job_title, email, paylocity_id)"
    )
    .eq("session_id", sessionId)
    .neq("status", "cancelled");
  if (enrErr) throw enrErr;

  const attendees = ((enrollments ?? []) as unknown as EnrollmentJoin[])
    .map((e) => e.employees)
    .filter(
      (e): e is NonNullable<EnrollmentJoin["employees"]> => e != null
    );

  // 3. Group attendees by department (missing department → "—")
  const NO_DEPT = "(No department)";
  const byDepartment = new Map<
    string,
    Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      position: string | null;
      job_title: string | null;
      email: string | null;
    }>
  >();
  for (const emp of attendees) {
    const dept = emp.department?.trim() || NO_DEPT;
    const list = byDepartment.get(dept) ?? [];
    list.push({
      id: emp.id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      position: emp.position,
      job_title: emp.job_title,
      email: emp.email,
    });
    byDepartment.set(dept, list);
  }
  // Sort each dept's attendees by last name
  for (const list of byDepartment.values()) {
    list.sort((a, b) => {
      const la = (a.last_name ?? "").toLowerCase();
      const lb = (b.last_name ?? "").toLowerCase();
      if (la !== lb) return la.localeCompare(lb);
      return (a.first_name ?? "").localeCompare(b.first_name ?? "");
    });
  }

  // 4. Derive managers for each represented department
  const realDepartments = Array.from(byDepartment.keys()).filter(
    (d) => d !== NO_DEPT
  );
  const managersByDept = await getManagersByDepartment(realDepartments);

  // 5. Build the formatted memo text
  const memoLines: string[] = [];
  memoLines.push("Hey there,");
  memoLines.push("");
  memoLines.push(
    `This is a reminder that you have an upcoming training for ${trainingName}. Please see details below:`
  );
  memoLines.push("");
  memoLines.push(`Date:     ${formatDate(typedSession.session_date)}`);
  memoLines.push(`Time:     ${formatTimeRange(typedSession.start_time, typedSession.end_time)}`);
  memoLines.push(`Location: ${typedSession.location ?? "TBD"}`);
  if (typedSession.training_types?.renewal_years) {
    memoLines.push(
      `Renewal:  ${typedSession.training_types.renewal_years}-year certification`
    );
  }
  if (typedSession.notes) {
    memoLines.push("");
    memoLines.push(`Notes: ${typedSession.notes}`);
  }
  memoLines.push("");
  memoLines.push(`You are receiving this because you or a direct report is`);
  memoLines.push(`scheduled to attend the training listed above. Please make`);
  memoLines.push(`arrangements for coverage and confirm attendance.`);
  memoLines.push("");
  memoLines.push("─".repeat(60));
  memoLines.push(`ATTENDEES (${attendees.length})`);
  memoLines.push("─".repeat(60));
  memoLines.push("");

  // Flat, alphabetized roster — no department headers. HR asked for a
  // single combined list because the memo goes straight to everyone.
  const sortedDepts = Array.from(byDepartment.keys()).sort();
  const flatAttendees = sortedDepts.flatMap((d) => byDepartment.get(d) ?? []);
  flatAttendees.sort((a, b) => {
    const la = (a.last_name ?? "").toLowerCase();
    const lb = (b.last_name ?? "").toLowerCase();
    if (la !== lb) return la.localeCompare(lb);
    return (a.first_name ?? "").localeCompare(b.first_name ?? "");
  });
  for (const emp of flatAttendees) {
    const name = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
    const extras: string[] = [];
    if (emp.job_title) extras.push(emp.job_title);
    else if (emp.position) extras.push(emp.position);
    const suffix = extras.length ? ` — ${extras.join(", ")}` : "";
    memoLines.push(`  • ${name}${suffix}`);
  }

  // Managers are still resolved (for the "Open in email" recipient
  // list on the preview modal) but we no longer print a forward-to
  // section in the memo body — this memo goes directly to employees
  // and their managers, so a separate forward list isn't needed.
  const allManagers: ManagerRow[] = [];
  for (const dept of sortedDepts) {
    if (dept === NO_DEPT) continue;
    const mgrs = managersByDept.get(dept) ?? [];
    for (const m of mgrs) allManagers.push(m);
  }

  // Sign-off. Legacy (shared HR password) sessions sign as the
  // generic office; individual Supabase users sign with their name
  // and job title.
  memoLines.push("");
  memoLines.push("");
  memoLines.push("Thank you,");
  if (currentUser && !currentUser.isLegacy) {
    memoLines.push(currentUser.name);
    if (currentUser.title) {
      memoLines.push(currentUser.title);
    }
  } else {
    memoLines.push("Human Resources");
  }

  const memoText = memoLines.join("\n");

  return {
    session: {
      id: typedSession.id,
      training_name: trainingName,
      session_date: typedSession.session_date,
      start_time: typedSession.start_time,
      end_time: typedSession.end_time,
      location: typedSession.location,
      capacity: typedSession.capacity,
      notes: typedSession.notes,
    },
    attendees_by_department: Object.fromEntries(byDepartment),
    managers_by_department: Object.fromEntries(managersByDept),
    attendee_count: attendees.length,
    manager_count: allManagers.length,
    memo_text: memoText,
  };
});

function formatDate(iso: string): string {
  // "2026-04-15" → "Wednesday, April 15, 2026"
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "TBD";
  const s = start ? formatTime(start) : "";
  const e = end ? formatTime(end) : "";
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

function formatTime(raw: string): string {
  // "14:30" or "14:30:00" → "2:30 PM"
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return raw;
  const h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${min} ${ampm}`;
}
