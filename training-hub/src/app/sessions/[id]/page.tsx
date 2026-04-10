"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, XCircle, AlertTriangle, UserX, Archive, RotateCcw, UserPlus } from "lucide-react";

interface Enrollee {
  enrollment_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  paylocity_id: string | null;
  department: string | null;
  enrollment_status: string;
  signed_in: boolean;
  signin_time: string | null;
  pass_fail: string | null;
  notes: string | null;
}

interface WalkIn {
  employee_id: string;
  first_name: string;
  last_name: string;
  signed_in: boolean;
  signin_time: string | null;
  pass_fail: string | null;
}

interface NextSession {
  id: string;
  session_date: string;
  start_time: string | null;
  location: string | null;
}

interface SessionData {
  session: {
    id: string;
    session_date: string;
    start_time: string | null;
    location: string | null;
    status: string;
    capacity: number;
    training_name: string;
    training_type: { renewal_years: number } | null;
  };
  enrollees: Enrollee[];
  walk_ins: WalkIn[];
  next_sessions: NextSession[];
}

type AttendeeStatus = "passed" | "failed" | "no_show" | "attended";

export default function SessionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AttendeeStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { void load(); }, [id]);

  async function load() {
    try {
      const r = await fetch(`/api/sessions/${id}`);
      const j = await r.json();
      if (j.error) { setError(j.error); return; }
      setData(j);
      // Pre-fill statuses from existing enrollment data
      const initial: Record<string, AttendeeStatus> = {};
      for (const e of j.enrollees ?? []) {
        if (e.enrollment_status === "no_show") initial[e.employee_id] = "no_show";
        else if (e.enrollment_status === "passed") initial[e.employee_id] = "passed";
        else if (e.enrollment_status === "failed") initial[e.employee_id] = "failed";
        else if (e.signed_in) initial[e.employee_id] = "passed"; // default signed-in to pass
        else initial[e.employee_id] = "no_show"; // default not-signed-in to no-show
      }
      setStatuses(initial);
    } catch (e) { setError(e instanceof Error ? e.message : "Load failed"); }
  }

  async function saveReview() {
    if (!data) return;
    setSaving(true);
    setSaved(false);
    try {
      const attendees = data.enrollees.map(e => ({
        employee_id: e.employee_id,
        enrollment_id: e.enrollment_id,
        status: statuses[e.employee_id] ?? "no_show",
        pass_fail: statuses[e.employee_id] === "passed" ? "Pass" : statuses[e.employee_id] === "failed" ? "Fail" : null,
        notes: notes[e.employee_id] ?? null,
      }));
      await fetch(`/api/sessions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", attendees }),
      });
      setSaved(true);
      void load();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function archiveSession() {
    await fetch(`/api/sessions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive" }),
    });
    void load();
  }

  async function reopenSession() {
    await fetch(`/api/sessions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen" }),
    });
    void load();
  }

  async function addToNextSession(employeeId: string, targetSessionId: string) {
    await fetch(`/api/sessions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_to_session", employee_id: employeeId, target_session_id: targetSessionId }),
    });
    void load();
  }

  if (error) return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 m-6">{error}</div>;
  if (!data) return <div className="p-6 text-slate-400">Loading session...</div>;

  const s = data.session;
  const isArchived = s.status === "completed";
  const noShows = data.enrollees.filter(e => (statuses[e.employee_id] ?? e.enrollment_status) === "no_show");
  const passedCount = Object.values(statuses).filter(v => v === "passed").length;
  const failedCount = Object.values(statuses).filter(v => v === "failed").length;
  const noShowCount = Object.values(statuses).filter(v => v === "no_show").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{s.training_name}</h1>
            <p className="text-sm text-slate-500">
              {s.session_date} {s.start_time ? `at ${s.start_time}` : ""} {s.location ? `in ${s.location}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${isArchived ? "bg-slate-50 text-slate-500 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
              {isArchived ? "Archived" : "Scheduled"}
            </span>
            {isArchived ? (
              <button type="button" onClick={reopenSession} className="flex items-center gap-1 text-xs px-3 py-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 font-semibold text-slate-900">
                <RotateCcw className="h-3.5 w-3.5" /> Reopen
              </button>
            ) : (
              <button type="button" onClick={archiveSession} className="flex items-center gap-1 text-xs px-3 py-1.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 font-semibold text-slate-900">
                <Archive className="h-3.5 w-3.5" /> Archive
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-4 mt-3 text-sm">
          <span className="text-emerald-700 font-semibold">{passedCount} passed</span>
          <span className="text-red-700 font-semibold">{failedCount} failed</span>
          <span className="text-amber-700 font-semibold">{noShowCount} no-show</span>
          <span className="text-slate-500">{data.enrollees.length} enrolled</span>
        </div>
      </div>

      {/* Enrollees */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Enrolled attendees</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {data.enrollees.map(e => (
            <div key={e.employee_id} className="p-3 sm:p-4 hover:bg-slate-50">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Link href={`/employees/${e.employee_id}`} className="font-medium text-blue-600 hover:text-blue-800 text-sm">
                  {e.last_name}, {e.first_name}
                </Link>
                {e.paylocity_id && <span className="text-xs text-slate-400">{e.paylocity_id}</span>}
                {e.department && <span className="text-xs text-slate-400">{e.department}</span>}
                {e.signed_in && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                    Signed in {e.signin_time ?? ""}
                  </span>
                )}
                {!e.signed_in && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-red-50 text-red-700 border-red-200">
                    Did not sign in
                  </span>
                )}
              </div>
              {!isArchived && (
                <div className="flex flex-wrap items-center gap-2">
                  <StatusButton current={statuses[e.employee_id]} value="passed" label="Pass" color="emerald"
                    icon={<CheckCircle className="h-3.5 w-3.5" />}
                    onClick={() => setStatuses({ ...statuses, [e.employee_id]: "passed" })} />
                  <StatusButton current={statuses[e.employee_id]} value="failed" label="Fail" color="red"
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    onClick={() => setStatuses({ ...statuses, [e.employee_id]: "failed" })} />
                  <StatusButton current={statuses[e.employee_id]} value="no_show" label="No Show" color="amber"
                    icon={<UserX className="h-3.5 w-3.5" />}
                    onClick={() => setStatuses({ ...statuses, [e.employee_id]: "no_show" })} />
                  <input type="text" placeholder="Notes..."
                    value={notes[e.employee_id] ?? ""}
                    onChange={ev => setNotes({ ...notes, [e.employee_id]: ev.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex-1 min-w-[120px]" />
                </div>
              )}
              {isArchived && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                  e.enrollment_status === "passed" || e.enrollment_status === "attended" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  e.enrollment_status === "failed" ? "bg-red-50 text-red-700 border-red-200" :
                  e.enrollment_status === "no_show" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-slate-50 text-slate-500 border-slate-200"
                }`}>
                  {e.enrollment_status}
                </span>
              )}
            </div>
          ))}
          {data.enrollees.length === 0 && (
            <div className="p-4 text-sm text-slate-400">No one enrolled in this session.</div>
          )}
        </div>
      </div>

      {/* Walk-ins */}
      {data.walk_ins.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-slate-100">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Walk-ins (signed in but not enrolled)</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {data.walk_ins.map(w => (
              <div key={w.employee_id} className="p-3 flex items-center gap-2 text-sm hover:bg-slate-50">
                <span className="font-medium text-slate-900">{w.last_name}, {w.first_name}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">Signed in {w.signin_time ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No-show suggestions */}
      {noShows.length > 0 && data.next_sessions.length > 0 && !isArchived && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> No-shows: add to next session?
          </h3>
          <div className="space-y-2">
            {noShows.map(ns => (
              <div key={ns.employee_id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-900">{ns.last_name}, {ns.first_name}</span>
                <span className="text-slate-400">Add to:</span>
                {data.next_sessions.map(next => (
                  <button key={next.id} type="button"
                    onClick={() => addToNextSession(ns.employee_id, next.id)}
                    className="inline-flex items-center gap-1 text-xs border border-amber-200 bg-white rounded-lg px-2 py-1 text-amber-800 hover:bg-amber-100 font-semibold">
                    <UserPlus className="h-3 w-3" />
                    {next.session_date}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save / Archive buttons */}
      {!isArchived && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={saveReview} disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : "Save review"}
          </button>
          {saved && <span className="text-emerald-600 text-sm self-center">Saved.</span>}
          <button type="button" onClick={archiveSession}
            className="px-4 py-2.5 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 font-semibold text-sm text-slate-900 flex items-center gap-1">
            <Archive className="h-4 w-4" /> Save and archive
          </button>
        </div>
      )}
    </div>
  );
}

function StatusButton({ current, value, label, color, icon, onClick }: {
  current: string | undefined; value: string; label: string; color: string; icon: React.ReactNode; onClick: () => void;
}) {
  const active = current === value;
  const colors: Record<string, { active: string; inactive: string }> = {
    emerald: { active: "bg-emerald-600 text-white", inactive: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    red: { active: "bg-red-600 text-white", inactive: "bg-red-50 text-red-700 border border-red-200" },
    amber: { active: "bg-amber-600 text-white", inactive: "bg-amber-50 text-amber-700 border border-amber-200" },
  };
  const cls = active ? colors[color]?.active : colors[color]?.inactive;
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-colors ${cls}`}>
      {icon} {label}
    </button>
  );
}
