"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Plus,
  UserPlus,
  X,
  Loader2,
  Check,
  AlertTriangle,
  Clock,
  XCircle,
  Printer,
  ClipboardCheck,
  Trash2,
  Zap,
  Archive,
  RefreshCw,
  Pencil,
  Copy,
  CalendarDays,
  Lock,
  ChevronRight,
} from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { PRIMARY_TRAININGS } from "@/config/primary-trainings";
import { namesMatch, normalizeNameForCompare } from "@/lib/name-utils";
import { trainingMatchesAny } from "@/lib/training-match";
import { EXCUSAL_REASONS } from "@/config/excusal-reasons";
import { ROSTER_AUTOMATION_FREEZE_DAYS } from "@/lib/training-constants";

interface SessionData {
  id: string;
  training: string;
  date: string;
  sortDateMs: number;
  time: string;
  endTime: string;
  location: string;
  enrolled: string[];
  noShows: string[];
  capacity: number;
  status: "scheduled" | "completed";
  manualRosterLock: boolean;
  autoRosterLock14d: boolean;
  rosterAutomationLocked: boolean;
}

async function fetchMemoPayload(
  sessionId: string
): Promise<{ memo_text: string; calendar_text: string }> {
  const res = await fetch(`/api/sessions/${sessionId}/memo`);
  if (!res.ok) {
    throw new Error(`Memo request failed (${res.status})`);
  }
  const payload = (await res.json()) as {
    memo_text?: string;
    calendar_text?: string;
  };
  if (!payload.memo_text || !payload.calendar_text) {
    throw new Error("Memo response missing text fields");
  }
  return { memo_text: payload.memo_text, calendar_text: payload.calendar_text };
}

interface ScheduleData {
  sessions: SessionData[];
}

interface NeedEmployee {
  name: string;
  status: "expired" | "expiring_soon" | "needed" | "current";
  noShowCount?: number;
  daysExpired: number;
  daysUntilExpiry: number;
  division: string;
}

export default function SchedulePage() {
  const { data, loading, error } = useFetch<ScheduleData>("/api/schedule");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [enrollingSession, setEnrollingSession] = useState<string | null>(null);
  const [finalizingSession, setFinalizingSession] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<SessionData | null>(null);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [autoFilling, setAutoFilling] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copiedMemoIds, setCopiedMemoIds] = useState<Set<string>>(new Set());
  const [copiedCalendarIds, setCopiedCalendarIds] = useState<Set<string>>(new Set());

  async function handleCopyCalendar(session: SessionData) {
    try {
      const { calendar_text } = await fetchMemoPayload(session.id);
      await navigator.clipboard.writeText(calendar_text);
      setCopiedCalendarIds((prev) => {
        const next = new Set(prev);
        next.add(session.id);
        return next;
      });
      setTimeout(() => {
        setCopiedCalendarIds((prev) => {
          const next = new Set(prev);
          next.delete(session.id);
          return next;
        });
      }, 2000);
    } catch {}
  }

  async function handleCopyMemo(session: SessionData) {
    try {
      const { memo_text } = await fetchMemoPayload(session.id);
      await navigator.clipboard.writeText(memo_text);
      setCopiedMemoIds((prev) => {
        const next = new Set(prev);
        next.add(session.id);
        return next;
      });
      setTimeout(() => {
        setCopiedMemoIds((prev) => {
          const next = new Set(prev);
          next.delete(session.id);
          return next;
        });
      }, 2000);
    } catch {}
  }

  // Force re-fetch after changes
  const { data: freshData } = useFetch<ScheduleData>(`/api/schedule?r=${refreshKey}`);
  const displayData = freshData || data;

  const { data: fillData } = useFetch<{
    sessions: Array<{ days_until_session: number; needs_attention: boolean; training_name: string; session_date: string; enrolled: number; capacity: number }>;
    totals: { session_count: number; underfilled_count: number; total_enrolled: number; total_capacity: number };
  }>(`/api/session-fill-summary?horizon=60&r=${refreshKey}`);

  if (loading && !displayData) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!displayData) return null;

  const { sessions } = displayData;
  const upcoming = sessions.filter((s) => s.status === "scheduled").sort((a, b) => a.sortDateMs - b.sortDateMs);
  const past = sessions.filter((s) => s.status === "completed").sort((a, b) => b.sortDateMs - a.sortDateMs);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch {}
    setRefreshing(false);
  }

  async function handleAutoFill(session: SessionData) {
    if (session.rosterAutomationLocked) {
      const reasons: string[] = [];
      if (session.manualRosterLock) reasons.push("roster automation is locked for this session (Edit → checkbox)");
      if (session.autoRosterLock14d) {
        reasons.push(
          `the class date is within the next ${ROSTER_AUTOMATION_FREEZE_DAYS} days (minimum notice window)`
        );
      }
      alert(
        `Auto-fill is disabled: ${reasons.join(" and ")}. Add or remove enrollments manually.`
      );
      return;
    }

    setAutoFilling(session.id);
    try {
      // Get employees who need this training
      const res = await fetch(`/api/needs-training?training=${encodeURIComponent(session.training)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Collect all names already enrolled in ANY session of this training type
      const alreadyEnrolled: string[] = [];
      for (const s of sessions) {
        if (s.status === "scheduled" && trainingMatchesAny(s.training, session.training)) {
          for (const name of s.enrolled) {
            alreadyEnrolled.push(name);
          }
        }
      }

      const needs = (data.employees as NeedEmployee[]).filter(
        (e) => !alreadyEnrolled.some((enrolled) => namesMatch(enrolled, e.name))
      );

      const spotsLeft = session.capacity - session.enrolled.length;
      const toEnroll = needs.slice(0, spotsLeft).map((e) => e.name);

      if (toEnroll.length === 0) {
        alert("No employees need this training or class is already full.");
        setAutoFilling(null);
        return;
      }

      const enrollRes = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, names: toEnroll }),
      });
      const enrollData = await enrollRes.json();
      if (!enrollRes.ok) throw new Error(enrollData.error);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Auto-fill failed");
    }
    setAutoFilling(null);
  }

  async function handleArchiveScheduled(id: string) {
    setDeleteLoading(true);
    try {
      await fetch(`/api/sessions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      refresh();
    } catch {}
    setDeleteLoading(false);
    setDeletingSession(null);
  }

  async function handleHardDelete(id: string) {
    setDeleteLoading(true);
    try {
      await fetch("/api/delete-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
      });
      refresh();
    } catch {}
    setDeleteLoading(false);
    setDeletingSession(null);
  }

  async function handleArchive(id: string) {
    setArchiving(id);
    try {
      await fetch(`/api/sessions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      refresh();
    } catch {}
    setArchiving(null);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
            <p className="text-sm text-slate-500 mt-0.5 max-w-xl">
              {upcoming.length} upcoming session{upcoming.length !== 1 ? "s" : ""}. Rows sync from the Scheduled sheet;
              enroll people here and open each class for attendance.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
            title="Refresh data from Google Sheets"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/schedule/print"
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-white bg-slate-50/80 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print roster
          </Link>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New session
          </button>
        </div>
      </div>

      {fillData?.totals && fillData.totals.session_count > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Roster fill (next 60 days)</h2>
            <Link
              href="/operations"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
            >
              Operations overview
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Same window as Today / Operations. Sessions below 80% enrolled need a top-off. Auto-fill and auto-prune stay off
            within <strong>{ROSTER_AUTOMATION_FREEZE_DAYS} days</strong> of class and when a session is manually locked (Edit).
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-slate-50 py-2 px-2">
              <p className="text-lg font-bold text-slate-900">{fillData.totals.session_count}</p>
              <p className="text-[11px] text-slate-500">Sessions</p>
            </div>
            <div
              className={`rounded-lg py-2 px-2 ${
                fillData.totals.underfilled_count > 0 ? "bg-amber-50" : "bg-emerald-50"
              }`}
            >
              <p
                className={`text-lg font-bold ${
                  fillData.totals.underfilled_count > 0 ? "text-amber-800" : "text-emerald-800"
                }`}
              >
                {fillData.totals.underfilled_count}
              </p>
              <p className={`text-[11px] ${fillData.totals.underfilled_count > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                Below 80% fill
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 py-2 px-2">
              <p className="text-lg font-bold text-slate-900">{fillData.totals.total_enrolled}</p>
              <p className="text-[11px] text-slate-500">Enrolled seats</p>
            </div>
            <div className="rounded-lg bg-slate-50 py-2 px-2">
              <p className="text-lg font-bold text-slate-900">{fillData.totals.total_capacity}</p>
              <p className="text-[11px] text-slate-500">Total capacity</p>
            </div>
          </div>
          {fillData.totals.underfilled_count > 0 ? (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {fillData.totals.underfilled_count} session{fillData.totals.underfilled_count !== 1 ? "s" : ""} still under 80%
              fill — enroll manually, from Compliance, or use Auto-fill when not locked.
            </p>
          ) : (
            <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              All sessions in this window are at or above 80% fill.
            </p>
          )}
          {(() => {
            const soon = (fillData.sessions ?? []).filter(
              (s) => s.days_until_session >= 0 && s.days_until_session <= ROSTER_AUTOMATION_FREEZE_DAYS
            );
            if (soon.length === 0) return null;
            const need = soon.filter((s) => s.needs_attention).length;
            return (
              <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-3 space-y-1.5">
                <p className="text-sm font-semibold text-slate-800">
                  Two-week window (next {ROSTER_AUTOMATION_FREEZE_DAYS} calendar days)
                </p>
                <p className="text-xs text-slate-600">
                  {soon.length} class day{soon.length !== 1 ? "s" : ""} in range — roster automation is frozen.
                  {need > 0
                    ? ` ${need} still under 80% fill; send notices and adjust rosters by hand.`
                    : " All of these dates are at least 80% full."}
                </p>
              </div>
            );
          })()}
        </section>
      )}

      {/* Create Session Modal */}
      {showCreateForm && (
        <CreateSessionForm
          onClose={() => setShowCreateForm(false)}
          onCreated={() => { setShowCreateForm(false); refresh(); }}
        />
      )}

      {/* Edit Session Modal */}
      {editingSession && (
        <EditSessionModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={() => { setEditingSession(null); refresh(); }}
        />
      )}

      {/* Enroll Modal */}
      {enrollingSession !== null && (
        <EnrollModal
          session={sessions.find((s) => s.id === enrollingSession)!}
          allSessions={sessions}
          onClose={() => setEnrollingSession(null)}
          onEnrolled={() => { setEnrollingSession(null); refresh(); }}
        />
      )}

      {/* Finalize Modal */}
      {finalizingSession !== null && (
        <FinalizeModal
          session={sessions.find((s) => s.id ===finalizingSession)!}
          onClose={() => setFinalizingSession(null)}
          onFinalized={() => { setFinalizingSession(null); refresh(); }}
        />
      )}

      {/* Upcoming sessions */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Upcoming Sessions ({upcoming.length})</h2>
        </div>
        {upcoming.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            No upcoming sessions. Click &quot;New Session&quot; to schedule one.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcoming.map((session) => {
              const enrolledCount = session.enrolled.length;
              const spotsLeft = session.capacity - enrolledCount;
              const isFull = spotsLeft <= 0;

              return (
                <div key={session.id} className="px-6 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-semibold text-slate-900 text-lg">{session.training}</span>
                      {session.rosterAutomationLocked && (
                        <span
                          className="ml-2 inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
                          title={
                            session.manualRosterLock && session.autoRosterLock14d
                              ? "Manual roster lock and two-week auto lock"
                              : session.manualRosterLock
                                ? "Manual roster lock — auto-fill and auto-prune skipped"
                                : `Within ${ROSTER_AUTOMATION_FREEZE_DAYS} days of class — auto-fill and auto-prune skipped`
                          }
                        >
                          <Lock className="h-3 w-3" />
                          {session.manualRosterLock && session.autoRosterLock14d
                            ? "Locked"
                            : session.manualRosterLock
                              ? "Locked (manual)"
                              : "2-week lock"}
                        </span>
                      )}
                      <span className="ml-3 text-sm text-slate-500">
                        {session.date}{session.time ? ` at ${session.time}` : ""}
                      </span>
                      {session.location && (
                        <span className="ml-3 text-sm text-slate-400">{session.location}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className={`text-sm font-medium ${isFull ? "text-red-600" : "text-slate-900"}`}>
                          {enrolledCount}/{session.capacity}
                        </span>
                        <span className={`ml-1 text-xs ${isFull ? "text-red-500" : spotsLeft <= 2 ? "text-yellow-600" : "text-slate-400"}`}>
                          {isFull ? "FULL" : `${spotsLeft} left`}
                        </span>
                      </div>
                      <button
                        onClick={() => setEditingSession(session)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors bg-slate-50 text-slate-600 hover:bg-slate-100"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <a
                        href={`/sessions/${session.id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors bg-blue-50 text-blue-700 hover:bg-blue-100"
                      >
                        <ClipboardCheck className="h-3 w-3" />
                        Attendance
                      </a>
                      <button
                        onClick={() => handleCopyMemo(session)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors bg-violet-50 text-violet-700 hover:bg-violet-100"
                        title="Copy a class announcement memo to the clipboard"
                      >
                        {copiedMemoIds.has(session.id) ? (
                          <>
                            <Check className="h-3 w-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy Memo
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleCopyCalendar(session)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors bg-sky-50 text-sky-700 hover:bg-sky-100"
                        title="Copy a Paylocity calendar block to the clipboard"
                      >
                        {copiedCalendarIds.has(session.id) ? (
                          <>
                            <Check className="h-3 w-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <CalendarDays className="h-3 w-3" />
                            Paylocity
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setFinalizingSession(session.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors bg-amber-50 text-amber-700 hover:bg-amber-100"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        No-Shows
                      </button>
                      <button
                        onClick={() => handleAutoFill(session)}
                        disabled={isFull || autoFilling === session.id || session.rosterAutomationLocked}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                          isFull || session.rosterAutomationLocked
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                        title={
                          session.rosterAutomationLocked
                            ? "Roster automation locked — use manual enroll"
                            : "Auto-fill with employees who need this training"
                        }
                      >
                        {autoFilling === session.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                        Auto-Fill
                      </button>
                      <button
                        onClick={() => setEnrollingSession(session.id)}
                        disabled={isFull}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                          isFull
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                        }`}
                      >
                        <UserPlus className="h-3 w-3" />
                        Enroll
                      </button>
                      {deletingSession === session.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleArchiveScheduled(session.id)}
                            disabled={deleteLoading}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                            title="Move to Past Sessions"
                          >
                            {deleteLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Archive"}
                          </button>
                          <button
                            onClick={() => handleHardDelete(session.id)}
                            disabled={deleteLoading}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                            title="Delete session entirely"
                          >
                            {deleteLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
                          </button>
                          <button
                            onClick={() => setDeletingSession(null)}
                            disabled={deleteLoading}
                            className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingSession(session.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Remove session"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Enrolled list */}
                  {enrolledCount > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {session.enrolled.map((name) => (
                        <EnrolledChip
                          key={name}
                          name={name}
                          training={session.training}
                          sessionId={session.id}
                          onRemoved={refresh}
                        />
                      ))}
                      <RemoveAllButton sessionId={session.id} count={enrolledCount} onRemoved={refresh} />
                    </div>
                  )}

                  {/* No-shows */}
                  {session.noShows.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-xs font-semibold text-red-500 uppercase self-center mr-1">No-Shows:</span>
                      {session.noShows.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-full line-through"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past sessions */}
      {past.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Past Sessions ({past.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {past.map((session) => (
              <div key={session.id} className="px-6 py-3 flex items-center justify-between group">
                <div>
                  <span className="font-medium text-slate-900">{session.training}</span>
                  <span className="ml-3 text-sm text-slate-500">{session.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">{session.enrolled.length}/{session.capacity}</span>
                  <StatusBadge status="completed" type="session" />
                  <button
                    onClick={() => handleArchive(session.id)}
                    disabled={archiving === session.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700 opacity-0 group-hover:opacity-100"
                    title="Move to Archive sheet"
                  >
                    {archiving === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Create Session Form
// ────────────────────────────────────────────────────────────

function CreateSessionForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [trainingType, setTrainingType] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trainingType || !date) return;

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainingType, date, time, location, enrollees: [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Schedule New Session</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Training Type</label>
            <select
              value={trainingType}
              onChange={(e) => setTrainingType(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select training...</option>
              {PRIMARY_TRAININGS.map((t) => (
                <option key={t.name} value={t.name}>{t.name} ({t.classCapacity} seats)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Time (optional)</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Location (optional)</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Training Room A"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !trainingType || !date}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? "Creating..." : "Create Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Enroll Modal — shows who needs this training
// ────────────────────────────────────────────────────────────

function EnrollModal({
  session,
  allSessions,
  onClose,
  onEnrolled,
}: {
  session: { id: string; training: string; enrolled: string[]; capacity: number };
  allSessions: SessionData[];
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [needsList, setNeedsList] = useState<NeedEmployee[]>([]);
  const [allList, setAllList] = useState<NeedEmployee[] | null>(null);
  const [loadingNeeds, setLoadingNeeds] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);
  const [override, setOverride] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const spotsLeft = session.capacity - session.enrolled.length;

  // Names already enrolled in any scheduled session of the same training type.
  // We exclude these from both the needs list and the override list so the
  // operator can't double-enroll the same person for the same training.
  const alreadyEnrolled = useMemo(() => {
    const names: string[] = [];
    for (const s of allSessions) {
      if (s.status === "scheduled" && trainingMatchesAny(s.training, session.training)) {
        for (const name of s.enrolled) {
          names.push(name);
        }
      }
    }
    return names;
  }, [allSessions, session.training]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/needs-training?training=${encodeURIComponent(session.training)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // Filter out anyone already enrolled in any matching session
        const filtered = (data.employees as NeedEmployee[]).filter(
          (e) => !alreadyEnrolled.some((enrolled) => namesMatch(enrolled, e.name))
        );
        setNeedsList(filtered);
      } catch {
        setError("Failed to load employee needs list");
      } finally {
        setLoadingNeeds(false);
      }
    }
    load();
  }, [session.training, alreadyEnrolled]);

  // Lazy-load the full employee roster the first time the operator
  // flips the override toggle. Override is the operator's escape hatch, so
  // we deliberately cast a wide net:
  //   - `active=all` so terminated/inactive employees are searchable too
  //   - no fuzzy namesMatch filter against already-enrolled (it false-
  //     positives on initial-only entries like "J Smith"); we trust the
  //     operator to pick the right person
  //   - dedupe needsList vs everyone via normalizeNameForCompare so casing
  //     and token-order differences don't cause drops.
  useEffect(() => {
    if (!override || allList !== null || loadingAll) return;
    setLoadingAll(true);
    (async () => {
      try {
        const res = await fetch("/api/employees?active=all");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        type EmployeeRow = {
          name: string;
          department?: string;
          position?: string;
          is_active?: boolean;
        };
        const needsKeys = new Set(
          needsList.map((n) => normalizeNameForCompare(n.name))
        );
        // Include inactive employees too — override is the operator's
        // escape hatch, and inactive rows sometimes represent staff on
        // leave or waiting for rehire reactivation. Active first so the
        // common case is at the top of the list. We keep the raw name so
        // the enroll POST still matches the employees table.
        const rows = (data.employees as EmployeeRow[])
          .filter((e) => e.name)
          .filter((e) => !needsKeys.has(normalizeNameForCompare(e.name)));
        const toNeed = (e: EmployeeRow): NeedEmployee => ({
          name: e.name,
          status: "current",
          daysExpired: 0,
          daysUntilExpiry: 0,
          division: e.department ?? e.position ?? "",
        });
        const everyone: NeedEmployee[] = [
          ...rows.filter((e) => e.is_active !== false).map(toNeed),
          ...rows.filter((e) => e.is_active === false).map(toNeed),
        ];
        setAllList([...needsList, ...everyone]);
      } catch {
        setError("Failed to load full employee list");
        setOverride(false);
      } finally {
        setLoadingAll(false);
      }
    })();
  }, [override, allList, loadingAll, needsList]);

  function toggleSelect(name: string) {
    const next = new Set(selected);
    if (next.has(name)) {
      next.delete(name);
    } else if (next.size < spotsLeft) {
      next.add(name);
    }
    setSelected(next);
  }

  async function handleEnroll() {
    if (selected.size === 0) return;
    setSaving(true);
    setError("");
    try {
      // Pass force=true when the override toggle is on so the backend
      // skips the "already in another session for this training" guard
      // and the active-only employee lookup. Without this flag the
      // operator's override picks were getting silently dropped.
      const names = Array.from(selected);
      const postEnroll = async (allowExcused: boolean) =>
        fetch("/api/enroll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.id,
            names,
            force: override,
            allowExcused,
          }),
        });

      let res = await postEnroll(false);
      let data = await res.json();

      // 409 + excused_block means the server refused because some
      // picks are excused for this training. Ask the operator and
      // retry with allowExcused:true on confirm.
      if (res.status === 409 && data?.code === "excused_block") {
        const blocked: string[] = Array.isArray(data.excusedBlocked)
          ? data.excusedBlocked
          : [];
        const msg =
          `${blocked.length === 1 ? "This person is" : "These people are"} ` +
          `excused from ${session.training}:\n\n` +
          `  • ${blocked.join("\n  • ")}\n\n` +
          `Enroll anyway?`;
        if (!window.confirm(msg)) {
          setSaving(false);
          return;
        }
        res = await postEnroll(true);
        data = await res.json();
      }

      if (!res.ok) throw new Error(data.error);
      onEnrolled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enroll");
    } finally {
      setSaving(false);
    }
  }

  const activeList = override && allList ? allList : needsList;
  const filtered = activeList.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  const statusIcon = (status: string) => {
    if (status === "expired") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    if (status === "expiring_soon") return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    if (status === "current") return <Check className="h-3.5 w-3.5 text-emerald-500" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Enroll — {session.training}
            </h2>
            <p className="text-sm text-slate-500">
              {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} available &middot; {selected.size} selected
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-100 space-y-2">
          <input
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <span>
              Include anyone <span className="text-slate-400">(override — adds employees who don&apos;t currently need this training)</span>
            </span>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingNeeds || (override && loadingAll) ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              {override ? "Loading all employees..." : "Loading employees who need this training..."}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              {search ? "No matches." : override ? "No employees available." : "No employees need this training."}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((emp) => {
                const isSelected = selected.has(emp.name);
                const isDisabled = !isSelected && selected.size >= spotsLeft;

                return (
                  <button
                    key={emp.name}
                    onClick={() => toggleSelect(emp.name)}
                    disabled={isDisabled}
                    className={`w-full flex items-center justify-between px-6 py-3 text-left transition-colors ${
                      isSelected
                        ? "bg-blue-50"
                        : isDisabled
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected ? "bg-blue-600 border-blue-600" : "border-slate-200"
                      }`}>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <span className="text-sm font-medium text-slate-900">{emp.name}</span>
                      {emp.noShowCount && emp.noShowCount > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 rounded-full">
                          {emp.noShowCount} NS
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {emp.status === "expired" && emp.daysExpired > 0 && (
                        <span className="text-[10px] font-medium text-red-600">
                          {emp.daysExpired === 9999 ? "no date" : `expired ${emp.daysExpired}d ago`}
                        </span>
                      )}
                      {emp.status === "expiring_soon" && emp.daysUntilExpiry > 0 && (
                        <span className="text-[10px] font-medium text-amber-600">
                          expires in {emp.daysUntilExpiry}d
                        </span>
                      )}
                      {statusIcon(emp.status)}
                      <StatusBadge status={emp.status} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="px-6 py-2 text-sm text-red-600">{error}</p>}

        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleEnroll}
            disabled={saving || selected.size === 0}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {saving ? "Enrolling..." : `Enroll ${selected.size} Employee${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Remove All button for a session
// ────────────────────────────────────────────────────────────

function RemoveAllButton({ sessionId, count, onRemoved }: { sessionId: string; count: number; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRemoveAll() {
    setRemoving(true);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "remove_all" }),
      });
      if (res.ok) onRemoved();
    } catch {}
    setRemoving(false);
    setConfirming(false);
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 ml-1">
        <button
          onClick={handleRemoveAll}
          disabled={removing}
          className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {removing ? "..." : `Remove all ${count}`}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-[11px] text-slate-400 hover:text-slate-600"
        >
          cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors ml-1"
      title="Remove all enrolled people"
    >
      <XCircle className="h-3 w-3" />
      Clear all
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// Enrolled chip — shows name with X to remove
// ────────────────────────────────────────────────────────────

function EnrolledChip({
  name,
  training,
  sessionId,
  onRemoved,
}: {
  name: string;
  training: string;
  sessionId: string;
  onRemoved: () => void;
}) {
  const chipRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [showDateInput, setShowDateInput] = useState(false);
  const [prevDate, setPrevDate] = useState("");
  const [showExcuseInput, setShowExcuseInput] = useState(false);

  function closeOptions() {
    setShowOptions(false);
    setShowDateInput(false);
    setShowExcuseInput(false);
    setPopupPos(null);
  }

  function openOptions() {
    const rect = chipRef.current?.getBoundingClientRect();
    if (!rect) {
      setShowOptions(true);
      return;
    }
    // Popup width is ~200px; anchor to the chip's left edge but keep
    // it fully on screen.
    const POPUP_WIDTH = 200;
    const POPUP_HEIGHT_ESTIMATE = 240;
    const margin = 8;
    let left = rect.left;
    if (left + POPUP_WIDTH + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - POPUP_WIDTH - margin);
    }
    // Prefer opening below the chip; flip above when there isn't
    // enough room (e.g. the mealtime row at the bottom of the page
    // just above the archive section).
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const top = spaceBelow >= POPUP_HEIGHT_ESTIMATE || spaceBelow >= spaceAbove
      ? rect.bottom + 4
      : Math.max(margin, rect.top - POPUP_HEIGHT_ESTIMATE - 4);
    setPopupPos({ top, left });
    setShowOptions(true);
  }

  // Close on outside click, Escape, scroll, or resize — any of
  // these would otherwise leave the popup stranded over stale content.
  useEffect(() => {
    if (!showOptions) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (chipRef.current?.contains(target)) return;
      closeOptions();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeOptions();
    }
    function onScrollOrResize() {
      closeOptions();
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [showOptions]);

  // Find the training column key
  const def = PRIMARY_TRAININGS.find(
    (d) => d.name.toLowerCase() === training.toLowerCase() ||
      d.aliases?.some((a: string) => a.toLowerCase() === training.toLowerCase())
  );
  const columnKey = def?.columnKey || training;

  async function doRemove(options: { terminate?: boolean } = {}) {
    setRemoving(true);
    try {
      await fetch("/api/remove-enrollee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, name, terminate: options.terminate === true }),
      });
      onRemoved();
    } catch {} finally { setRemoving(false); }
  }

  async function handleNoLongerEmployee() {
    const ok = window.confirm(
      `Mark ${name} as no longer an employee?\n\nThis removes them from this session AND sets their status to inactive in the employee file. You can reactivate them later.`
    );
    if (!ok) return;
    closeOptions();
    await doRemove({ terminate: true });
  }

  async function handleFailed() {
    setRemoving(true);
    try {
      // Write "FX1" to the training column
      await fetch("/api/record-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName: name, trainingColumnKey: columnKey, completionDate: "FX1" }),
      });
      await doRemove();
    } catch { setRemoving(false); }
  }

  async function handleNotNeeded() {
    await doRemove();
  }

  async function handlePrevDate() {
    if (!prevDate.trim()) return;
    setRemoving(true);
    try {
      await fetch("/api/record-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName: name, trainingColumnKey: columnKey, completionDate: prevDate.trim() }),
      });
      await doRemove();
    } catch { setRemoving(false); }
  }

  async function handleExcuse(reason: string) {
    setRemoving(true);
    try {
      await fetch("/api/excusal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: name,
          trainingColumnKey: columnKey,
          excused: true,
          reason,
        }),
      });
      await doRemove();
    } catch { setRemoving(false); }
  }

  if (removing) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-400 text-xs font-medium rounded-full">
        {name} <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }

  return (
    <span
      ref={chipRef}
      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full"
    >
      {name}
      <button
        onClick={() => (showOptions ? closeOptions() : openOptions())}
        className="hover:text-red-600 transition-colors"
        title={`Remove ${name}`}
      >
        <X className="h-3 w-3" />
      </button>

      {showOptions && popupPos && (
        <div
          ref={popupRef}
          style={{ position: "fixed", top: popupPos.top, left: popupPos.left, width: 200 }}
          className="z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-1 max-h-[70vh] overflow-y-auto"
        >
          <p className="px-2 py-1 text-[10px] text-slate-400 uppercase font-semibold">Remove {name}</p>
          <button
            onClick={handleFailed}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 text-red-700 rounded"
          >
            Failed — mark FX1
          </button>
          <button
            onClick={handleNotNeeded}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 text-slate-700 rounded"
          >
            Not Needed — just remove
          </button>
          {!showDateInput ? (
            <button
              onClick={() => setShowDateInput(true)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-blue-700 rounded"
            >
              Went Previous Date — log date
            </button>
          ) : (
            <div className="px-2 py-1.5 flex items-center gap-1">
              <input
                type="text"
                value={prevDate}
                onChange={(e) => setPrevDate(e.target.value)}
                placeholder="M/D/YYYY"
                autoFocus
                className="w-24 px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button onClick={handlePrevDate} disabled={!prevDate.trim()} className="px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                Save
              </button>
            </div>
          )}
          {!showExcuseInput ? (
            <button
              onClick={() => setShowExcuseInput(true)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 text-amber-700 rounded"
            >
              Excused — log reason
            </button>
          ) : (
            <div className="border-t border-slate-100 mt-1 pt-1">
              <p className="px-2 py-1 text-[10px] text-slate-400 uppercase font-semibold">Excuse reason</p>
              {EXCUSAL_REASONS.map((r) => (
                <button
                  key={r.code}
                  onClick={() => handleExcuse(r.code)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 text-amber-700 rounded"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-slate-100 mt-1 pt-1">
            <button
              onClick={handleNoLongerEmployee}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 text-red-700 rounded font-medium"
            >
              No Longer Employee — remove & deactivate
            </button>
          </div>
          <button
            onClick={closeOptions}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 text-slate-400 rounded"
          >
            Cancel
          </button>
        </div>
      )}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// Finalize Modal — mark no-shows after a class
// ────────────────────────────────────────────────────────────

function FinalizeModal({
  session,
  onClose,
  onFinalized,
}: {
  session: SessionData;
  onClose: () => void;
  onFinalized: () => void;
}) {
  const [noShows, setNoShows] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  function toggleNoShow(name: string) {
    const next = new Set(noShows);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setNoShows(next);
  }

  async function handleFinalize() {
    if (noShows.size === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await fetch("/api/no-shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          names: Array.from(noShows),
        }),
      });
    } catch {}
    setDone(true);
    setSaving(false);
    setTimeout(onFinalized, 1200);
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900">Mark No-Shows</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {session.training} — {session.date}{session.time ? ` at ${session.time}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {done ? (
            <div className="p-5">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-lg">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">Removed {noShows.size} no-show{noShows.size !== 1 ? "s" : ""} from enrollment.</span>
              </div>
            </div>
          ) : session.enrolled.length === 0 ? (
            <div className="p-5 text-center text-sm text-slate-400">No one enrolled in this session.</div>
          ) : (
            <>
              <p className="px-5 pt-4 text-xs text-slate-500">
                Check anyone who did <strong>not</strong> attend. They&apos;ll be removed from enrollment.
              </p>
              <div className="divide-y divide-slate-100 mt-2">
                {session.enrolled.map((name) => {
                  const isNoShow = noShows.has(name);
                  return (
                    <button
                      key={name}
                      onClick={() => toggleNoShow(name)}
                      className={`w-full flex items-center justify-between px-5 py-3 text-left transition-colors ${
                        isNoShow ? "bg-red-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isNoShow ? "bg-red-500 border-red-500" : "border-slate-200"
                        }`}>
                          {isNoShow && <X className="h-3.5 w-3.5 text-white" />}
                        </div>
                        <span className={`text-sm font-medium ${isNoShow ? "text-red-700 line-through" : "text-slate-900"}`}>
                          {name}
                        </span>
                      </div>
                      {isNoShow && (
                        <span className="text-xs font-semibold text-red-600 uppercase">No Show</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleFinalize}
            disabled={saving}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2 ${
              noShows.size > 0
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Removing...</>
            ) : noShows.size > 0 ? (
              <>Remove {noShows.size} No-Show{noShows.size !== 1 ? "s" : ""}</>
            ) : (
              <>All Attended</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Edit Session Modal
// ────────────────────────────────────────────────────────────

function EditSessionModal({
  session,
  onClose,
  onSaved,
}: {
  session: SessionData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [training, setTraining] = useState(session.training);
  const [date, setDate] = useState(session.date);
  const [time, setTime] = useState(session.time);
  const [location, setLocation] = useState(session.location);
  const [rosterManualLock, setRosterManualLock] = useState(session.manualRosterLock);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch("/api/edit-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          training,
          date,
          time,
          location,
          rosterManualLock,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Edit Session</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Training Type</label>
            <select
              value={training}
              onChange={(e) => setTraining(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select training...</option>
              {PRIMARY_TRAININGS.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
              {!PRIMARY_TRAININGS.some((t) => t.name === training) && training && (
                <option value={training}>{training}</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
            <input
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="e.g., 4/16/2026 or April 16"
              required
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Time</label>
            <input
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="e.g., 9am to 1pm"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Training Room A"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <input
              type="checkbox"
              checked={rosterManualLock}
              onChange={(e) => setRosterManualLock(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-800 leading-snug">
              <span className="font-medium">Lock roster automation</span>
              <span className="block text-xs text-slate-500 mt-1">
                Skips auto-fill and auto-prune for this session (for example prestaged dates). Classes within{" "}
                {ROSTER_AUTOMATION_FREEZE_DAYS} days of the session date are also locked automatically.
              </span>
            </span>
          </label>
          {session.autoRosterLock14d && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              This session is already inside the {ROSTER_AUTOMATION_FREEZE_DAYS}-day notice window, so roster automation
              stays off even if you clear the checkbox above.
            </p>
          )}
          {editError && <p className="text-sm text-red-600">{editError}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !training || !date}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
