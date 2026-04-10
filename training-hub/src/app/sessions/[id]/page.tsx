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

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return <div className="p-6 text-gray-500">Loading session...</div>;

  const s = data.session;
  const isArchived = s.status === "completed";
  const noShows = data.enrollees.filter(e => (statuses[e.employee_id] ?? e.enrollment_status) === "no_show");
  const passedCount = Object.values(statuses).filter(v => v === "passed").length;
  const failedCount = Object.values(statuses).filter(v => v === "failed").length;
  const noShowCount = Object.values(statuses).filter(v => v === "no_show").length;

  return (
    <div className="p-3 sm:p-6 max-w-full sm:max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{s.training_name}</h1>
            <p className="text-sm text-gray-500">
              {s.session_date} {s.start_time ? `at ${s.start_time}` : ""} {s.location ? `in ${s.location}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs rounded-full px-3 py-1 font-semibold ${isArchived ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-700"}`}>
              {isArchived ? "Archived" : "Scheduled"}
            </span>
            {isArchived ? (
              <button type="button" onClick={reopenSession} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg font-semibold">
                <RotateCcw className="h-3.5 w-3.5" /> Reopen
              </button>
            ) : (
              <button type="button" onClick={archiveSession} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg font-semibold">
                <Archive className="h-3.5 w-3.5" /> Archive
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-4 mt-3 text-sm">
          <span className="text-green-700 font-semibold">{passedCount} passed</span>
          <span className="text-red-700 font-semibold">{failedCount} failed</span>
          <span className="text-amber-700 font-semibold">{noShowCount} no-show</span>
          <span className="text-gray-500">{data.enrollees.length} enrolled</span>
        </div>
      </div>

      {/* Enrollees */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h2 className="font-semibold text-sm">Enrolled attendees</h2>
        </div>
        <div className="divide-y">
          {data.enrollees.map(e => (
            <div key={e.employee_id} className="p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Link href={`/employees/${e.employee_id}`} className="font-medium text-blue-600 hover:underline text-sm">
                  {e.last_name}, {e.first_name}
                </Link>
                {e.paylocity_id && <span className="text-xs text-gray-400">{e.paylocity_id}</span>}
                {e.department && <span className="text-xs text-gray-400">{e.department}</span>}
                {e.signed_in && (
                  <span className="text-xs bg-green-50 text-green-700 rounded px-1.5 py-0.5">
                    Signed in {e.signin_time ?? ""}
                  </span>
                )}
                {!e.signed_in && (
                  <span className="text-xs bg-red-50 text-red-600 rounded px-1.5 py-0.5">
                    Did not sign in
                  </span>
                )}
              </div>
              {!isArchived && (
                <div className="flex flex-wrap items-center gap-2">
                  <StatusButton current={statuses[e.employee_id]} value="passed" label="Pass" color="green"
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
                    className="text-xs rounded border-gray-200 px-2 py-1.5 flex-1 min-w-[120px]" />
                </div>
              )}
              {isArchived && (
                <span className={`text-xs font-semibold rounded px-2 py-0.5 ${
                  e.enrollment_status === "passed" || e.enrollment_status === "attended" ? "bg-green-100 text-green-700" :
                  e.enrollment_status === "failed" ? "bg-red-100 text-red-700" :
                  e.enrollment_status === "no_show" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {e.enrollment_status}
                </span>
              )}
            </div>
          ))}
          {data.enrollees.length === 0 && (
            <div className="p-4 text-sm text-gray-500">No one enrolled in this session.</div>
          )}
        </div>
      </div>

      {/* Walk-ins */}
      {data.walk_ins.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
          <div className="px-4 py-3 bg-blue-50 border-b">
            <h2 className="font-semibold text-sm text-blue-800">Walk-ins (signed in but not enrolled)</h2>
          </div>
          <div className="divide-y">
            {data.walk_ins.map(w => (
              <div key={w.employee_id} className="p-3 flex items-center gap-2 text-sm">
                <span className="font-medium">{w.last_name}, {w.first_name}</span>
                <span className="text-xs bg-green-50 text-green-700 rounded px-1.5 py-0.5">Signed in {w.signin_time ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No-show suggestions */}
      {noShows.length > 0 && data.next_sessions.length > 0 && !isArchived && (
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-4 mb-4">
          <h3 className="font-semibold text-sm text-amber-800 mb-2 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> No-shows: add to next session?
          </h3>
          <div className="space-y-2">
            {noShows.map(ns => (
              <div key={ns.employee_id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{ns.last_name}, {ns.first_name}</span>
                <span className="text-gray-400">Add to:</span>
                {data.next_sessions.map(next => (
                  <button key={next.id} type="button"
                    onClick={() => addToNextSession(ns.employee_id, next.id)}
                    className="inline-flex items-center gap-1 text-xs bg-white border border-amber-300 rounded px-2 py-1 text-amber-800 hover:bg-amber-100">
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
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm disabled:opacity-50 shadow">
            {saving ? "Saving..." : "Save review"}
          </button>
          {saved && <span className="text-green-600 text-sm self-center">Saved.</span>}
          <button type="button" onClick={archiveSession}
            className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-semibold text-sm flex items-center gap-1">
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
    green: { active: "bg-green-600 text-white", inactive: "bg-green-50 text-green-700 border border-green-200" },
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
