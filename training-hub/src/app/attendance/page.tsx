"use client";

import { useState, useRef } from "react";
import {
  CheckCircle2, UserPlus, Loader2, AlertCircle, Users, Search,
  Zap, CheckCheck, X, ClipboardList, Calendar,
} from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import { TRAINING_DEFINITIONS, AUTO_FILL_RULES } from "@/config/trainings";

// ── Types ──────────────────────────────────────────────────────────
interface SessionData {
  id: string;
  training: string;
  date: string;
  time: string;
  location: string;
  enrolled: string[];
  noShows: string[];
  capacity: number;
  status: "scheduled" | "completed";
}

interface ScheduleData { sessions: SessionData[] }

// ── Helpers ────────────────────────────────────────────────────────
function findTrainingDef(trainingName: string) {
  const lower = trainingName.toLowerCase();
  return TRAINING_DEFINITIONS.find((td) => {
    if (td.name.toLowerCase() === lower) return true;
    return td.aliases?.some((a) => a.toLowerCase() === lower);
  });
}

function toISODate(dateStr: string): string {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLinkedNote(columnKey: string): string {
  return AUTO_FILL_RULES
    .filter((r) => r.source.toUpperCase() === columnKey.toUpperCase())
    .map((r) => r.offsetDays === 0 ? `Also records ${r.target}` : `Also records ${r.target} (${r.offsetDays > 0 ? "+" : ""}${r.offsetDays}d)`)
    .join(" · ");
}

// ── Component ──────────────────────────────────────────────────────
export default function AttendancePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useFetch<ScheduleData>(`/api/schedule?r=${refreshKey}`);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [presentNames, setPresentNames] = useState<Set<string>>(new Set());
  const [processingNoShow, setProcessingNoShow] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Enroll (manual into session)
  const [manualName, setManualName] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Direct record mode (no session needed)
  const [directEmployee, setDirectEmployee] = useState("");
  const [directTraining, setDirectTraining] = useState("");
  const [directDate, setDirectDate] = useState(todayISO());
  const [directRecording, setDirectRecording] = useState(false);
  const [directMsg, setDirectMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [recentDirect, setRecentDirect] = useState<Array<{ employee: string; training: string; date: string; msg: string }>>([]);

  const [mode, setMode] = useState<"session" | "manual">("session");
  const directInputRef = useRef<HTMLInputElement>(null);

  const sessions = (data?.sessions ?? []).filter((s) => s.status === "scheduled");
  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  function handleSelectSession(id: string | null) {
    setSelectedSessionId(id);
    setPresentNames(new Set());
    setCompleteMessage(null);
    setCompleteError(null);
  }

  function togglePresent(name: string) {
    setPresentNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function markNoShow(name: string) {
    if (!selectedSession) return;
    setProcessingNoShow(name);
    try {
      await fetch("/api/no-shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSession.id, names: [name] }),
      });
      setRefreshKey((k) => k + 1);
    } catch {}
    setProcessingNoShow(null);
  }

  async function handleManualEnroll() {
    if (!selectedSession || !manualName.trim()) return;
    setEnrolling(true);
    setEnrollMsg(null);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSession.id, names: [manualName.trim()] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEnrollMsg({ ok: false, text: body.error || "Failed to enroll" });
      } else {
        setEnrollMsg({ ok: true, text: `Added "${manualName.trim()}" to session` });
        setManualName("");
        setRefreshKey((k) => k + 1);
      }
    } catch {
      setEnrollMsg({ ok: false, text: "Network error" });
    }
    setEnrolling(false);
  }

  async function handleCompleteSession() {
    if (!selectedSession || presentNames.size === 0) return;
    setCompleting(true);
    setCompleteMessage(null);
    setCompleteError(null);

    try {
      const trainingDef = findTrainingDef(selectedSession.training);
      if (!trainingDef) throw new Error(`No training definition found for "${selectedSession.training}"`);

      const completionDate = toISODate(selectedSession.date);
      const presentList = Array.from(presentNames);
      const failures: string[] = [];

      for (const name of presentList) {
        const res = await fetch("/api/record-completion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeName: name, trainingColumnKey: trainingDef.columnKey, completionDate }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          failures.push(`${name}: ${b.error || `HTTP ${res.status}`}`);
        }
      }

      const archiveRes = await fetch("/api/archive-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSession.id }),
      });
      if (!archiveRes.ok) {
        const b = await archiveRes.json().catch(() => ({}));
        throw new Error(b.error || "Failed to archive session");
      }

      // Auto-enroll in next training if configured
      let autoEnrolled = 0;
      if (trainingDef.autoEnrollNext) {
        try {
          const schedRes = await fetch("/api/schedule");
          const schedData = await schedRes.json();
          const targetDef = TRAINING_DEFINITIONS.find(
            (d) => d.name.toLowerCase() === trainingDef.autoEnrollNext!.toLowerCase()
          );
          if (targetDef) {
            const nextSess = (schedData.sessions || []).find(
              (s: { id: string; status: string; training: string; enrolled: string[]; capacity: number }) =>
                s.status === "scheduled" &&
                (s.training.toLowerCase() === targetDef.name.toLowerCase() ||
                  targetDef.aliases?.some((a) => a.toLowerCase() === s.training.toLowerCase())) &&
                s.enrolled.length < s.capacity
            );
            if (nextSess) {
              const er = await fetch("/api/enroll", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: nextSess.id, names: presentList }),
              });
              if (er.ok) autoEnrolled = presentList.length;
            }
          }
        } catch {}
      }

      const linked = getLinkedNote(trainingDef.columnKey);
      let msg = failures.length > 0
        ? `Completed. ${presentList.length - failures.length}/${presentList.length} recorded. Failures: ${failures.join("; ")}`
        : `✓ ${presentList.length} completion${presentList.length !== 1 ? "s" : ""} recorded for ${selectedSession.training}.`;
      if (linked) msg += `\n${linked}.`;
      if (autoEnrolled > 0) msg += `\n${autoEnrolled} auto-enrolled in ${trainingDef.autoEnrollNext}.`;

      setCompleteMessage(msg);
      setRefreshKey((k) => k + 1);
      setSelectedSessionId(null);
      setPresentNames(new Set());
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : "Failed to complete session");
    }
    setCompleting(false);
  }

  // Direct record (no session)
  async function handleDirectRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!directEmployee.trim() || !directTraining || !directDate) return;
    setDirectRecording(true);
    setDirectMsg(null);

    const [y, m, d] = directDate.split("-");
    const formattedDate = `${parseInt(m)}/${parseInt(d)}/${y}`;

    try {
      const res = await fetch("/api/record-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName: directEmployee.trim(), trainingColumnKey: directTraining, completionDate: formattedDate }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDirectMsg({ ok: false, text: body.error || "Failed to record" });
      } else {
        const trainingName = TRAINING_DEFINITIONS.find((t) => t.columnKey === directTraining)?.name || directTraining;
        setDirectMsg({ ok: true, text: body.message || "Recorded" });
        setRecentDirect((prev) => [
          { employee: directEmployee.trim(), training: trainingName, date: formattedDate, msg: body.message || "Recorded" },
          ...prev.slice(0, 4),
        ]);
        setDirectEmployee("");
        setDirectTraining("");
        setDirectDate(todayISO());
        setTimeout(() => directInputRef.current?.focus(), 50);
      }
    } catch {
      setDirectMsg({ ok: false, text: "Network error" });
    }
    setDirectRecording(false);
  }

  if (loading) return <Loading message="Loading sessions…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Attendance & Entry</h1>
        <p className="text-sm text-slate-500 mt-0.5">Track session attendance or record individual completions directly</p>
      </div>

      {/* ── Mode toggle ── */}
      <div className="flex bg-slate-100 rounded-lg p-1 w-fit gap-1">
        {([
          { id: "session", label: "Session View", icon: ClipboardList },
          { id: "manual", label: "Direct Entry", icon: Zap },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === id
                ? "bg-white shadow text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Success / error banners ── */}
      {completeMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-700 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-700 whitespace-pre-line">{completeMessage}</p>
          <button onClick={() => setCompleteMessage(null)} className="ml-auto text-emerald-700 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {completeError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{completeError}</p>
          <button onClick={() => setCompleteError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SESSION VIEW
      ═══════════════════════════════════════════════════════════ */}
      {mode === "session" && (
        <div className="space-y-6">
          {/* Session selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Select a Scheduled Session
            </label>
            {sessions.length === 0 ? (
              <p className="text-sm text-slate-500">No scheduled sessions found.</p>
            ) : (
              <select
                value={selectedSessionId ?? ""}
                onChange={(e) => handleSelectSession(e.target.value || null)}
                className="w-full max-w-xl px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose a session...</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.training} — {formatDate(s.date)}{s.time ? ` at ${s.time}` : ""} ({s.enrolled.length}/{s.capacity})
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedSession && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Session header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                      {selectedSession.training}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(selectedSession.date)}
                    {selectedSession.time && ` at ${selectedSession.time}`}
                    {selectedSession.location && ` — ${selectedSession.location}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400 shrink-0">
                  <Users className="h-4 w-4" />
                  {selectedSession.enrolled.length}/{selectedSession.capacity}
                </div>
              </div>

              {/* Add to session */}
              <div className="px-6 py-3 border-b border-slate-200 flex gap-2">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Add name to session..."
                    value={manualName}
                    onChange={(e) => { setManualName(e.target.value); setEnrollMsg(null); }}
                    onKeyDown={(e) => e.key === "Enter" && handleManualEnroll()}
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleManualEnroll}
                  disabled={enrolling || !manualName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Add
                </button>
                {enrollMsg && (
                  <span className={`text-xs self-center ${enrollMsg.ok ? "text-emerald-700" : "text-red-500"}`}>
                    {enrollMsg.text}
                  </span>
                )}
              </div>

              {/* Enrolled list */}
              {selectedSession.enrolled.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-sm">
                  No employees enrolled. Add names above.
                </div>
              ) : (
                <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedSession.enrolled.map((name) => {
                    const isPresent = presentNames.has(name);
                    const isNoShowing = processingNoShow === name;
                    return (
                      <div
                        key={name}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer select-none ${
                          isPresent
                            ? "border-2 border-blue-400 bg-blue-50"
                            : "border border-slate-200 bg-white hover:border-slate-300"
                        }`}
                        onClick={() => togglePresent(name)}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isPresent ? "bg-blue-500" : "bg-slate-200"}`}>
                          {isPresent && <CheckCircle2 className="h-4 w-4 text-white" />}
                        </div>
                        <span className={`text-sm font-medium flex-1 ${isPresent ? "text-slate-900" : "text-slate-700"}`}>
                          {name}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); markNoShow(name); }}
                          disabled={isNoShowing}
                          className="ml-auto text-xs px-2 py-0.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-all"
                          title="No Show"
                        >
                          {isNoShowing ? <Loader2 className="h-3 w-3 animate-spin" /> : "NS"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  <strong className="text-slate-900">{presentNames.size}</strong> of {selectedSession.enrolled.length} marked present
                </span>
                <button
                  onClick={handleCompleteSession}
                  disabled={completing || presentNames.size === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {completing
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Completing...</>
                    : <><CheckCheck className="h-4 w-4" /> Complete Session ({presentNames.size})</>
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          DIRECT ENTRY
      ═══════════════════════════════════════════════════════════ */}
      {mode === "manual" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Entry form */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">Record Training Completion</h2>
            </div>
            <form onSubmit={handleDirectRecord} className="px-6 py-5 space-y-4">
              <p className="text-xs text-slate-500">
                Records directly to the Training sheet. CPR and First Aid always sync together. Med training auto-fills Post Med.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Employee Name
                </label>
                <input
                  ref={directInputRef}
                  type="text"
                  value={directEmployee}
                  onChange={(e) => setDirectEmployee(e.target.value)}
                  placeholder="Last, First or First Last"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Training
                </label>
                <select
                  value={directTraining}
                  onChange={(e) => { setDirectTraining(e.target.value); setDirectMsg(null); }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Select training...</option>
                  {Array.from(
                    new Map(TRAINING_DEFINITIONS.map((t) => [t.columnKey, t])).values()
                  ).map((t) => (
                    <option key={t.columnKey} value={t.columnKey}>{t.name}</option>
                  ))}
                </select>
                {directTraining && getLinkedNote(directTraining) && (
                  <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1">
                    <Zap className="h-3 w-3" /> {getLinkedNote(directTraining)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={directDate}
                  onChange={(e) => setDirectDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {directMsg && (
                <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${directMsg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {directMsg.ok
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                  {directMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={directRecording || !directEmployee.trim() || !directTraining || !directDate}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {directRecording
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Recording...</>
                  : <><Zap className="h-4 w-4" /> Record Completion</>
                }
              </button>
            </form>
          </div>

          {/* Recent entries */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">This Session</h2>
            </div>
            {recentDirect.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto text-slate-200 mb-3" />
                <p className="text-sm text-slate-400">No entries yet this session</p>
                <p className="text-xs text-slate-400 mt-1">Records appear here as you add them</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentDirect.map((r, i) => (
                  <div key={i} className="px-6 py-3 flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{r.employee}</p>
                      <p className="text-xs text-slate-500 truncate">{r.training} — {r.date}</p>
                      {r.msg.includes("auto-filled") && (
                        <p className="text-xs text-blue-600 mt-0.5">{r.msg.split("—").slice(1).join("—").trim()}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
