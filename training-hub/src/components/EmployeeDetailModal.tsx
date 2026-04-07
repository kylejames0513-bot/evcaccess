"use client";

import { useState, useEffect } from "react";
import { UserPlus, X, Loader2, Check, Clock, XCircle, AlertTriangle, CheckCircle, CalendarPlus, ShieldOff, ShieldCheck, Ban, PenLine, MessageSquare } from "lucide-react";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import StatusBadge from "@/components/ui/StatusBadge";

interface EmployeeDetail {
  name: string;
  noShowCount: number;
  trainings: Array<{
    columnKey: string;
    value: string;
    date: string | null;
    status: string;
    isExcused: boolean;
    enrolledIn: { date: string; time: string } | null;
    openSessions: Array<{
      rowIndex: number;
      training: string;
      date: string;
      time: string;
      location: string;
      enrolledCount: number;
      capacity: number;
      sortDateMs: number;
    }>;
  }>;
}

const EXCUSAL_REASONS = [
  { code: "N/A", label: "N/A (General)" },
  { code: "Facilities", label: "Facilities" },
  { code: "MAINT", label: "Maintenance" },
  { code: "HR", label: "HR" },
  { code: "ADMIN", label: "Admin" },
  { code: "FINANCE", label: "Finance" },
  { code: "IT", label: "IT" },
  { code: "NURSE", label: "Nurse" },
  { code: "LPN", label: "LPN" },
  { code: "RN", label: "RN" },
  { code: "DIR", label: "Director" },
  { code: "MGR", label: "Manager" },
  { code: "SUPERVISOR", label: "Supervisor" },
  { code: "TRAINER", label: "Trainer" },
  { code: "BH", label: "Behavioral Health" },
  { code: "ELC", label: "ELC" },
  { code: "EI", label: "EI" },
  { code: "BOARD", label: "Board of Directors" },
];

const TRAINING_NAMES: Record<string, string> = Object.fromEntries(
  TRAINING_DEFINITIONS.reduce((map, d) => {
    if (!map.has(d.columnKey)) map.set(d.columnKey, d.name);
    return map;
  }, new Map<string, string>())
);

function ExcusalPicker({
  onSelect,
  onCancel,
}: {
  onSelect: (reason: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        autoFocus
        defaultValue=""
        onChange={(e) => { if (e.target.value) onSelect(e.target.value); }}
        className="px-2 py-1 border border-slate-200 rounded-md text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="" disabled>Reason...</option>
        {EXCUSAL_REASONS.map((r) => (
          <option key={r.code} value={r.code}>{r.label}</option>
        ))}
      </select>
      <button
        onClick={onCancel}
        className="p-0.5 text-slate-400 hover:text-slate-600"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function EmployeeDetailModal({ name, onClose, onEnrolled }: { name: string; onClose: () => void; onEnrolled: () => void }) {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [togglingExcusal, setTogglingExcusal] = useState<string | null>(null);
  const [excusingTraining, setExcusingTraining] = useState<string | null>(null);
  const [clearingNoShows, setClearingNoShows] = useState(false);
  const [loggingDate, setLoggingDate] = useState<string | null>(null);
  const [logDateValue, setLogDateValue] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  const [success, setSuccess] = useState("");
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    setLoadingDetail(true);
    // Load employee detail and notes in parallel
    Promise.all([
      fetch(`/api/employee-detail?name=${encodeURIComponent(name)}&r=${detailRefresh}`).then((r) => r.json()),
      fetch(`/api/training-notes?employee=${encodeURIComponent(name)}`).then((r) => r.json()).catch(() => ({ notes: {} })),
    ]).then(([detailData, notesData]) => {
      if (!detailData.error) setDetail(detailData);
      setNotes(notesData.notes || {});
    }).catch(() => {}).finally(() => setLoadingDetail(false));
  }, [name, detailRefresh]);

  async function handleSaveNote(columnKey: string) {
    setSavingNote(true);
    try {
      await fetch("/api/training-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee: name, training: columnKey, note: noteText.trim() }),
      });
      setNotes({ ...notes, [columnKey]: noteText.trim() });
      setEditingNote(null);
      setNoteText("");
    } catch {}
    setSavingNote(false);
  }

  async function handleEnroll(sessionRowIndex: number, trainingName: string) {
    setEnrolling(trainingName);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionRowIndex, names: [name] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Enrolled in ${trainingName}!`);
      setTimeout(onEnrolled, 1200);
    } catch {
    } finally {
      setEnrolling(null);
    }
  }

  async function handleExcuse(columnKey: string, reason: string) {
    setTogglingExcusal(columnKey);
    setExcusingTraining(null);
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
      setDetailRefresh((k) => k + 1);
    } catch {}
    setTogglingExcusal(null);
  }

  async function handleUnexcuse(columnKey: string) {
    setTogglingExcusal(columnKey);
    try {
      await fetch("/api/excusal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: name,
          trainingColumnKey: columnKey,
          excused: false,
        }),
      });
      setDetailRefresh((k) => k + 1);
    } catch {}
    setTogglingExcusal(null);
  }

  async function handleLogDate(columnKey: string) {
    if (!logDateValue.trim()) return;
    setSavingDate(true);
    try {
      const res = await fetch("/api/record-completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: name,
          trainingColumnKey: columnKey,
          completionDate: logDateValue.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLoggingDate(null);
      setLogDateValue("");
      setDetailRefresh((k) => k + 1);
    } catch {}
    setSavingDate(false);
  }

  async function handleClearNoShows() {
    setClearingNoShows(true);
    try {
      await fetch("/api/no-show-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", name }),
      });
      setDetailRefresh((k) => k + 1);
      onEnrolled();
    } catch {}
    setClearingNoShows(false);
  }

  const statusIcon = (status: string) => {
    if (status === "expired") return <XCircle className="h-4 w-4 text-red-500" />;
    if (status === "expiring_soon") return <Clock className="h-4 w-4 text-amber-500" />;
    if (status === "needed") return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    if (status === "current") return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    return <CheckCircle className="h-4 w-4 text-slate-400" />;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-900 text-lg">{name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Training compliance detail</p>
          </div>
          <div className="flex items-center gap-2">
            {detail && detail.noShowCount > 0 && (
              <button
                onClick={handleClearNoShows}
                disabled={clearingNoShows}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors"
                title={`Clear ${detail.noShowCount} no-show flag(s)`}
              >
                {clearingNoShows ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                Clear {detail.noShowCount} NS
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {success ? (
            <div className="p-5">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-700 rounded-lg">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">{success}</span>
              </div>
            </div>
          ) : loadingDetail ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading training details...</div>
          ) : !detail ? (
            <div className="py-12 text-center text-sm text-slate-400">Could not load employee details.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {detail.trainings.map((t) => {
                const displayName = TRAINING_NAMES[t.columnKey] || t.columnKey;
                const needsAction = t.status === "expired" || t.status === "expiring_soon" || t.status === "needed";

                return (
                  <div key={t.columnKey} className={`px-5 py-4 ${needsAction ? "bg-red-50/30" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {statusIcon(t.status)}
                        <div>
                          <p className="text-sm font-medium text-slate-900">{displayName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {t.isExcused ? `Excused (${t.value})` : t.date ? `Completed ${t.date}` : "No date on file"}
                          </p>
                          {/* Note */}
                          {notes[t.columnKey] && editingNote !== t.columnKey && (
                            <button
                              onClick={() => { setEditingNote(t.columnKey); setNoteText(notes[t.columnKey]); }}
                              className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium rounded-md border border-amber-200 hover:bg-amber-100"
                            >
                              <MessageSquare className="h-2.5 w-2.5" />
                              {notes[t.columnKey]}
                            </button>
                          )}
                          {editingNote === t.columnKey && (
                            <div className="mt-1 flex items-center gap-1">
                              <input
                                type="text"
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                placeholder="e.g., Waiting on CPR card"
                                autoFocus
                                className="w-48 px-2 py-1 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <button
                                onClick={() => handleSaveNote(t.columnKey)}
                                disabled={savingNote}
                                className="px-2 py-1 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {savingNote ? "..." : "Save"}
                              </button>
                              <button onClick={() => { setEditingNote(null); setNoteText(""); }} className="px-1 py-1 text-[10px] text-slate-400">Cancel</button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={t.status} />
                        {togglingExcusal === t.columnKey ? (
                          <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                        ) : t.isExcused ? (
                          <button
                            onClick={() => handleUnexcuse(t.columnKey)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title={`Remove excusal (currently: ${t.value})`}
                          >
                            <ShieldOff className="h-3 w-3" /> Unexcuse
                          </button>
                        ) : excusingTraining === t.columnKey ? (
                          <ExcusalPicker
                            onSelect={(reason) => handleExcuse(t.columnKey, reason)}
                            onCancel={() => setExcusingTraining(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setExcusingTraining(t.columnKey)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-50 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                            title="Mark as excused"
                          >
                            <ShieldCheck className="h-3 w-3" /> Excuse
                          </button>
                        )}
                        {/* Log Date button */}
                        {loggingDate !== t.columnKey && (
                          <button
                            onClick={() => { setLoggingDate(t.columnKey); setLogDateValue(t.date || ""); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            title="Record or edit completion date"
                          >
                            <PenLine className="h-3 w-3" /> Log Date
                          </button>
                        )}
                        {/* Add Note button */}
                        {!notes[t.columnKey] && editingNote !== t.columnKey && (
                          <button
                            onClick={() => { setEditingNote(t.columnKey); setNoteText(""); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                            title="Add a note"
                          >
                            <MessageSquare className="h-3 w-3" /> Note
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline date logging form */}
                    {loggingDate === t.columnKey && (
                      <div className="mt-2 ml-7 flex items-center gap-2">
                        <input
                          type="text"
                          value={logDateValue}
                          onChange={(e) => setLogDateValue(e.target.value)}
                          placeholder="M/D/YYYY"
                          autoFocus
                          className="w-28 px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleLogDate(t.columnKey)}
                          disabled={savingDate || !logDateValue.trim()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingDate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Save
                        </button>
                        <button
                          onClick={() => { setLoggingDate(null); setLogDateValue(""); }}
                          className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {t.enrolledIn && (
                      <div className="mt-2 ml-7 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md ring-1 ring-inset ring-blue-600/20">
                        <CalendarPlus className="h-3 w-3" />
                        Scheduled {t.enrolledIn.date}{t.enrolledIn.time ? ` at ${t.enrolledIn.time}` : ""}
                      </div>
                    )}

                    {needsAction && !t.enrolledIn && t.openSessions.length > 0 && (
                      <div className="mt-2 ml-7 space-y-1.5">
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Available classes:</p>
                        {t.openSessions.map((s) => {
                          const spotsLeft = s.capacity - s.enrolledCount;
                          const isEnrolling = enrolling === t.columnKey;
                          return (
                            <button
                              key={s.rowIndex}
                              onClick={() => handleEnroll(s.rowIndex, displayName)}
                              disabled={isEnrolling}
                              className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left"
                            >
                              <div>
                                <p className="text-xs font-medium text-slate-900">
                                  {s.date}{s.time ? ` at ${s.time}` : ""}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {s.location || "No location"} &middot; {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""}
                                </p>
                              </div>
                              {isEnrolling ? (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                              ) : (
                                <UserPlus className="h-4 w-4 text-blue-500" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {needsAction && !t.enrolledIn && t.openSessions.length === 0 && (
                      <p className="mt-2 ml-7 text-xs text-slate-400">
                        No open classes — <a href="/schedule" className="text-blue-600 hover:text-blue-800 font-medium">schedule one</a>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
