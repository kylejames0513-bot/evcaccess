// ============================================================
// Upcoming session capacity vs enrollments (rolling horizon).
// ============================================================
// Used by /operations and /api/session-fill-summary. Server-only;
// uses service-role Supabase client like other internal reads.
// ============================================================

import { createServerClient } from "@/lib/supabase";
import { addDaysLocalYmd, daysBetweenLocalDates, toLocalYmd } from "@/lib/date-ymd";
import { isAutoRosterLockWithin14Days, isRosterAutomationLocked } from "@/lib/roster-lock";

export interface SessionFillRow {
  session_id: string;
  training_name: string;
  session_date: string;
  start_time: string | null;
  location: string | null;
  capacity: number;
  enrolled: number;
  fill_ratio: number;
  needs_attention: boolean;
  /** Whole days from today (local) to session_date; 0 = today. */
  days_until_session: number;
  /** HR toggled lock on the session row. */
  roster_manual_lock: boolean;
  /** Session date falls inside the two-week notice window. */
  auto_roster_lock_14d: boolean;
  /** Manual lock and/or two-week window — same as schedule auto-fill / prune skip. */
  roster_automation_locked: boolean;
}

export interface SessionFillTotals {
  session_count: number;
  underfilled_count: number;
  total_capacity: number;
  total_enrolled: number;
}

/**
 * Scheduled sessions from today through +horizonDays with enrollment counts.
 * `needs_attention` is true when fill is strictly below 80% of capacity.
 */
export async function getSessionFillSummary(horizonDays: number = 60): Promise<{
  sessions: SessionFillRow[];
  totals: SessionFillTotals;
}> {
  const db = createServerClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayYmd = toLocalYmd(today);
  const endYmd = addDaysLocalYmd(today, Math.max(1, Math.min(horizonDays, 120)));

  const { data: sessions, error: sErr } = await db
    .from("training_sessions")
    .select(
      `
      id,
      session_date,
      start_time,
      location,
      capacity,
      status,
      roster_manual_lock,
      training_types ( name )
    `
    )
    .eq("status", "scheduled")
    .gte("session_date", todayYmd)
    .lte("session_date", endYmd)
    .order("session_date", { ascending: true })
    .limit(500);

  if (sErr) throw new Error(sErr.message);
  if (!sessions?.length) {
    return {
      sessions: [],
      totals: { session_count: 0, underfilled_count: 0, total_capacity: 0, total_enrolled: 0 },
    };
  }

  const ids = sessions.map((s) => s.id as string);
  const { data: enrollments, error: eErr } = await db
    .from("enrollments")
    .select("session_id, status")
    .in("session_id", ids);
  if (eErr) throw new Error(eErr.message);

  const enrolledBySession = new Map<string, number>();
  for (const e of enrollments ?? []) {
    const st = (e as { status: string }).status;
    if (st === "cancelled" || st === "no_show") continue;
    const sid = (e as { session_id: string }).session_id;
    enrolledBySession.set(sid, (enrolledBySession.get(sid) ?? 0) + 1);
  }

  type SessJoin = {
    id: string;
    session_date: string;
    start_time: string | null;
    location: string | null;
    capacity: number;
    roster_manual_lock?: boolean | null;
    training_types: { name: string } | null;
  };

  const rows: SessionFillRow[] = [];
  let totalCap = 0;
  let totalEnr = 0;
  let underfilled = 0;

  for (const raw of sessions as unknown as SessJoin[]) {
    const cap = Math.max(1, raw.capacity);
    const enrolled = enrolledBySession.get(raw.id) ?? 0;
    const fill = enrolled / cap;
    const needs = fill < 0.8;
    if (needs) underfilled += 1;
    totalCap += cap;
    totalEnr += enrolled;
    const daysUntil = daysBetweenLocalDates(todayYmd, raw.session_date);
    const manual = Boolean(raw.roster_manual_lock);
    const auto14 = isAutoRosterLockWithin14Days(todayYmd, raw.session_date);
    const locked = isRosterAutomationLocked(todayYmd, raw.session_date, manual);
    rows.push({
      session_id: raw.id,
      training_name: raw.training_types?.name ?? "Training",
      session_date: raw.session_date,
      start_time: raw.start_time,
      location: raw.location,
      capacity: cap,
      enrolled,
      fill_ratio: Math.round(fill * 1000) / 1000,
      needs_attention: needs,
      days_until_session: daysUntil,
      roster_manual_lock: manual,
      auto_roster_lock_14d: auto14,
      roster_automation_locked: locked,
    });
  }

  return {
    sessions: rows,
    totals: {
      session_count: rows.length,
      underfilled_count: underfilled,
      total_capacity: totalCap,
      total_enrolled: totalEnr,
    },
  };
}
