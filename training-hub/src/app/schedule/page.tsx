"use client";

import { useState, useEffect } from "react";
import { Plus, UserPlus, X, Loader2, Check, AlertTriangle, Clock, XCircle, Printer, ClipboardCheck, Trash2, Zap, Archive, RefreshCw, Pencil, Copy } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { PRIMARY_TRAININGS } from "@/config/primary-trainings";
import { namesMatch } from "@/lib/name-utils";
import { trainingMatchesAny } from "@/lib/training-match";

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
}

function buildMemo(s: SessionData): string {
  const weekday = new Date(s.sortDateMs).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeRange = s.time && s.endTime ? `${s.time} – ${s.endTime}` : s.time || "TBD";
  const attendees = s.enrolled.length
    ? s.enrolled.map((n) => `  - ${n}`).join("\n")
    : "  (none enrolled yet)";
  return [
    `Training: ${s.training}`,
    `Date: ${weekday}`,
    `Time: ${timeRange}`,
    `Location: ${s.location || "TBD"}`,
    `Attendees (${s.enrolled.length}):`,
    attendees,
  ].join("\n");
}

interface ScheduleData {
  sessions: SessionData[];
}

interface NeedEmployee {
  name: string;
  status: "expired" | "expiring_soon" | "needed";
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

  async function handleCopyMemo(session: SessionData) {
    try {
      await navigator.clipboard.writeText(buildMemo(session));
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

  async function handleDelete(id: string) {
    setDeleteLoading(true);
    try {
      // Archive via the new sessions API
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
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Class Scheduler</h1>
          <p className="text-slate-500 mt-1">
            {upcoming.length} upcoming — from Scheduled sheet
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-200 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <a
            href="/schedule/print"
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print Roster
          </a>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Session
          </button>
        </div>
      </div>

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
          session={sessions.find((s) => s.id ===enrollingSession)!}
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
                        onClick={() => setFinalizingSession(session.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors bg-amber-50 text-amber-700 hover:bg-amber-100"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        No-Shows
                      </button>
                      <button
                        onClick={() => handleAutoFill(session)}
                        disabled={isFull || autoFilling === session.id}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                          isFull
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                        title="Auto-fill with employees who need this training"
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
                            onClick={() => handleDelete(session.id)}
                            disabled={deleteLoading}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                          >
                            {deleteLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Archive"}
                          </button>
                          <button
                            onClick={() => setDeletingSession(null)}
                            className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingSession(session.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Archive session"
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
  const [loadingNeeds, setLoadingNeeds] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const spotsLeft = session.capacity - session.enrolled.length;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/needs-training?training=${encodeURIComponent(session.training)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        // Collect all names enrolled in ANY session of this training type
        const alreadyEnrolled: string[] = [];
        for (const s of allSessions) {
          if (s.status === "scheduled" && trainingMatchesAny(s.training, session.training)) {
            for (const name of s.enrolled) {
              alreadyEnrolled.push(name);
            }
          }
        }

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
  }, [session.training, session.enrolled, allSessions]);

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
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, names: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onEnrolled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enroll");
    } finally {
      setSaving(false);
    }
  }

  const filtered = needsList.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  const statusIcon = (status: string) => {
    if (status === "expired") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    if (status === "expiring_soon") return <Clock className="h-3.5 w-3.5 text-amber-500" />;
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

        <div className="px-6 py-3 border-b border-slate-100">
          <input
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingNeeds ? (
            <div className="py-8 text-center text-slate-500 text-sm">Loading employees who need this training...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              {search ? "No matches." : "No employees need this training."}
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
  const [showOptions, setShowOptions] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showDateInput, setShowDateInput] = useState(false);
  const [prevDate, setPrevDate] = useState("");

  // Find the training column key
  const def = PRIMARY_TRAININGS.find(
    (d) => d.name.toLowerCase() === training.toLowerCase() ||
      d.aliases?.some((a: string) => a.toLowerCase() === training.toLowerCase())
  );
  const columnKey = def?.columnKey || training;

  async function doRemove() {
    setRemoving(true);
    try {
      await fetch("/api/remove-enrollee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, name }),
      });
      onRemoved();
    } catch {} finally { setRemoving(false); }
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

  if (removing) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-400 text-xs font-medium rounded-full">
        {name} <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full">
      {name}
      <button
        onClick={() => setShowOptions(!showOptions)}
        className="hover:text-red-600 transition-colors"
        title={`Remove ${name}`}
      >
        <X className="h-3 w-3" />
      </button>

      {showOptions && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-1 min-w-[180px]">
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
          <button
            onClick={() => { setShowOptions(false); setShowDateInput(false); }}
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
