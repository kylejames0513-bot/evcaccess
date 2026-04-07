"use client";

import { useState } from "react";
import { CheckCircle, UserPlus, Loader2, AlertCircle, Users, Search } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { TRAINING_DEFINITIONS } from "@/config/trainings";

// ── Types ──────────────────────────────────────────────────────────
interface SessionData {
  rowIndex: number;
  training: string;
  date: string;
  time: string;
  location: string;
  enrolled: string[];
  noShows: string[];
  capacity: number;
  status: "scheduled" | "completed";
}

interface ScheduleData {
  sessions: SessionData[];
}

// ── Helpers ────────────────────────────────────────────────────────

/** Find the TRAINING_DEFINITIONS entry whose name (or aliases) match a session training string */
function findTrainingDef(trainingName: string) {
  const lower = trainingName.toLowerCase();
  return TRAINING_DEFINITIONS.find((td) => {
    if (td.name.toLowerCase() === lower) return true;
    return td.aliases?.some((a) => a.toLowerCase() === lower);
  });
}

/** Convert a session date like "2026-04-03" to YYYY-MM-DD (pass-through) */
function toISODate(dateStr: string): string {
  // The API already returns dates in a parseable format.
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().slice(0, 10);
}

/** Format a date string for display */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Component ──────────────────────────────────────────────────────
export default function AttendancePage() {
  // Fetch sessions
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useFetch<ScheduleData>(`/api/schedule?r=${refreshKey}`);

  // Session selection
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  // Attendance tracking (local state: set of names marked present)
  const [presentNames, setPresentNames] = useState<Set<string>>(new Set());

  // Manual entry
  const [manualName, setManualName] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollSuccess, setEnrollSuccess] = useState<string | null>(null);

  // No-show processing
  const [processingNoShow, setProcessingNoShow] = useState<string | null>(null);

  // Complete session
  const [completing, setCompleting] = useState(false);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Tab: "session" or "manual"
  const [mode, setMode] = useState<"session" | "manual">("session");

  // Derive scheduled sessions only
  const sessions = (data?.sessions ?? []).filter((s) => s.status === "scheduled");
  const selectedSession = sessions.find((s) => s.rowIndex === selectedRowIndex) ?? null;

  // When selection changes, reset attendance state
  function handleSelectSession(rowIndex: number | null) {
    setSelectedRowIndex(rowIndex);
    setPresentNames(new Set());
    setCompleteMessage(null);
    setCompleteError(null);
  }

  // ── Mark present ───────────────────────────────────────────────
  function markPresent(name: string) {
    setPresentNames((prev) => new Set(prev).add(name));
  }

  // ── Mark no-show ───────────────────────────────────────────────
  async function markNoShow(name: string) {
    if (!selectedSession) return;
    setProcessingNoShow(name);
    try {
      const res = await fetch("/api/no-shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionRowIndex: selectedSession.rowIndex, names: [name] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      // Refresh data so the enrolled list updates
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("No-show error:", err);
    } finally {
      setProcessingNoShow(null);
    }
  }

  // ── Manual enroll ──────────────────────────────────────────────
  async function handleManualEnroll() {
    if (!selectedSession || !manualName.trim()) return;
    setEnrolling(true);
    setEnrollError(null);
    setEnrollSuccess(null);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionRowIndex: selectedSession.rowIndex, names: [manualName.trim()] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setEnrollSuccess(`Added "${manualName.trim()}" to session.`);
      setManualName("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setEnrollError(err instanceof Error ? err.message : "Failed to enroll");
    } finally {
      setEnrolling(false);
    }
  }

  // ── Complete session ───────────────────────────────────────────
  async function handleCompleteSession() {
    if (!selectedSession || presentNames.size === 0) return;
    setCompleting(true);
    setCompleteMessage(null);
    setCompleteError(null);

    try {
      // 1. Resolve the training column key
      const trainingDef = findTrainingDef(selectedSession.training);
      if (!trainingDef) {
        throw new Error(`Could not find training definition for "${selectedSession.training}"`);
      }

      const completionDate = toISODate(selectedSession.date);
      const presentList = Array.from(presentNames);

      // 2. Record completion for each present employee
      const failures: string[] = [];
      for (const name of presentList) {
        try {
          const res = await fetch("/api/record-completion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employeeName: name,
              trainingColumnKey: trainingDef.columnKey,
              completionDate,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            failures.push(`${name}: ${body.error || `HTTP ${res.status}`}`);
          }
        } catch {
          failures.push(`${name}: network error`);
        }
      }

      // 3. Archive the session
      const archiveRes = await fetch("/api/archive-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionRowIndex: selectedSession.rowIndex }),
      });
      if (!archiveRes.ok) {
        const body = await archiveRes.json().catch(() => ({}));
        throw new Error(body.error || "Failed to archive session");
      }

      // 4. Auto-enroll in next training if configured (e.g., Initial Med → Post Med)
      let autoEnrolled = 0;
      if (trainingDef.autoEnrollNext) {
        try {
          const schedRes = await fetch("/api/schedule");
          const schedData = await schedRes.json();
          const sessions = schedData.sessions || [];
          // Find next scheduled session for the target training
          const targetDef = TRAINING_DEFINITIONS.find(
            (d) => d.name.toLowerCase() === trainingDef.autoEnrollNext!.toLowerCase()
          );
          if (targetDef) {
            const nextSession = sessions.find(
              (s: { status: string; training: string; enrolled: string[]; capacity: number }) =>
                s.status === "scheduled" &&
                (s.training.toLowerCase() === targetDef.name.toLowerCase() ||
                 targetDef.aliases?.some((a) => a.toLowerCase() === s.training.toLowerCase())) &&
                s.enrolled.length < s.capacity
            );
            if (nextSession) {
              const enrollRes = await fetch("/api/enroll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionRowIndex: nextSession.rowIndex, names: presentList }),
              });
              if (enrollRes.ok) {
                const enrollData = await enrollRes.json();
                autoEnrolled = presentList.length;
              }
            }
          }
        } catch {}
      }

      let msg = "";
      if (failures.length > 0) {
        msg = `Session archived. ${presentList.length - failures.length} of ${presentList.length} completions recorded. Some failures:\n${failures.join("\n")}`;
      } else {
        msg = `Session completed! ${presentList.length} completion${presentList.length === 1 ? "" : "s"} recorded and session archived.`;
      }
      if (autoEnrolled > 0) {
        msg += `\n\n${autoEnrolled} employee${autoEnrolled !== 1 ? "s" : ""} auto-enrolled in next ${trainingDef.autoEnrollNext} session.`;
      }
      setCompleteMessage(msg);

      // Refresh and clear selection
      setRefreshKey((k) => k + 1);
      setSelectedRowIndex(null);
      setPresentNames(new Set());
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : "Failed to complete session");
    } finally {
      setCompleting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────
  if (loading) return <Loading message="Loading scheduled sessions..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Session Management</h1>
        <p className="text-slate-500 mt-1">
          Track attendance and complete training sessions
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex bg-slate-100 rounded-lg p-0.5 w-fit">
        {(["session", "manual"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === m ? "bg-white shadow text-slate-900" : "text-slate-600"
            }`}
          >
            {m === "session" ? "Session View" : "Manual Entry"}
          </button>
        ))}
      </div>

      {/* Success / error banners */}
      {completeMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          <p className="text-sm text-green-800 whitespace-pre-line">{completeMessage}</p>
        </div>
      )}
      {completeError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{completeError}</p>
        </div>
      )}

      {/* ── Session View ─────────────────────────────────────── */}
      {mode === "session" && (
        <div className="space-y-6">
          {/* Session selector */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Session
            </label>
            <select
              value={selectedRowIndex ?? ""}
              onChange={(e) =>
                handleSelectSession(e.target.value ? Number(e.target.value) : null)
              }
              className="w-full max-w-xl px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a scheduled session...</option>
              {sessions.map((s) => (
                <option key={s.rowIndex} value={s.rowIndex}>
                  {s.training} — {formatDate(s.date)}{s.time ? ` at ${s.time}` : ""} ({s.enrolled.length}/{s.capacity} enrolled)
                </option>
              ))}
            </select>
            {sessions.length === 0 && (
              <p className="text-sm text-slate-500 mt-2">No scheduled sessions found.</p>
            )}
          </div>

          {/* Enrolled list */}
          {selectedSession && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {selectedSession.training}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {formatDate(selectedSession.date)}{selectedSession.time ? ` at ${selectedSession.time}` : ""}
                    {selectedSession.location ? ` — ${selectedSession.location}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Users className="h-4 w-4" />
                  <span>{selectedSession.enrolled.length}/{selectedSession.capacity} enrolled</span>
                </div>
              </div>

              {selectedSession.enrolled.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-500 text-sm">
                  No employees enrolled in this session yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {selectedSession.enrolled.map((name) => {
                    const isPresent = presentNames.has(name);
                    const isProcessingNoShow = processingNoShow === name;
                    return (
                      <div
                        key={name}
                        className="flex items-center justify-between px-6 py-3"
                      >
                        <span className="text-sm text-slate-900">{name}</span>
                        <div className="flex items-center gap-2">
                          {isPresent ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-md">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Present
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => markPresent(name)}
                                className="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors"
                              >
                                Present
                              </button>
                              <button
                                onClick={() => markNoShow(name)}
                                disabled={isProcessingNoShow}
                                className="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors disabled:opacity-50"
                              >
                                {isProcessingNoShow ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "No Show"
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Summary bar */}
              {selectedSession.enrolled.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50 rounded-b-xl">
                  <span className="text-sm font-medium text-slate-700">
                    {presentNames.size} of {selectedSession.enrolled.length} Present
                  </span>
                  <button
                    onClick={handleCompleteSession}
                    disabled={completing || presentNames.size === 0}
                    className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    {completing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Completing...
                      </>
                    ) : (
                      "Complete Session"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Manual Entry ─────────────────────────────────────── */}
      {mode === "manual" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-xl">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Add Employee to Session
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Training Session
              </label>
              <select
                value={selectedRowIndex ?? ""}
                onChange={(e) =>
                  handleSelectSession(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a session...</option>
                {sessions.map((s) => (
                  <option key={s.rowIndex} value={s.rowIndex}>
                    {s.training} — {formatDate(s.date)}{s.time ? ` at ${s.time}` : ""} ({s.enrolled.length}/{s.capacity})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Employee Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="First Last or Last, First"
                  value={manualName}
                  onChange={(e) => {
                    setManualName(e.target.value);
                    setEnrollError(null);
                    setEnrollSuccess(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleManualEnroll();
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {enrollError && (
              <p className="text-sm text-red-600">{enrollError}</p>
            )}
            {enrollSuccess && (
              <p className="text-sm text-green-600">{enrollSuccess}</p>
            )}

            <button
              onClick={handleManualEnroll}
              disabled={enrolling || !selectedRowIndex || !manualName.trim()}
              className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {enrolling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Add to Session
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
