"use client";

import { useState, useMemo } from "react";
import {
  RefreshCw, Loader2, Check, XCircle, CheckCircle2, AlertTriangle,
  Layers, Users, FileText, Zap, History, ChevronDown, ChevronRight,
  File, FileX, ArrowRight, Clock,
} from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SmartSyncRow {
  employee: string;
  training: string;
  trainingDate: string;
  paylocityDate: string;
  phsDate: string;
  phsHasDoc: boolean;
  winner: string;
  winnerSource: "paylocity" | "phs";
  confidence: "high" | "medium" | "conflict";
  conflictNote: string;
}

interface RosterGap {
  name: string;
  recentTraining: string;
  recentDate: string;
  occurrences: number;
}

interface TrainingEvent {
  training: string;
  trainingName: string;
  date: string;
  attendees: string[];
  possiblyMissing: string[];
  source: "phs" | "paylocity";
}

interface DocAuditRow {
  employee: string;
  training: string;
  phsDate: string;
  hasDoc: boolean;
}

interface SyncData {
  rows: SmartSyncRow[];
  summary: {
    total: number;
    high: number;
    medium: number;
    conflicts: number;
    employeesAffected: number;
    fromPaylocity: number;
    fromPHS: number;
    hasPaylocity: boolean;
    hasPHS: boolean;
  };
  rosterGaps: { fromPaylocity: RosterGap[]; fromPHS: RosterGap[] };
  trainingEvents: TrainingEvent[];
  docAudit: DocAuditRow[];
  docSummary: { withDoc: number; withoutDoc: number };
  lastSyncAt: string | null;
}

interface SyncLogEntry {
  timestamp: string;
  source: string;
  applied: number;
  skipped: number;
  errors: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CONF_BADGE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  conflict: "bg-red-100 text-red-800",
};
const CONF_LABEL: Record<string, string> = {
  high: "HIGH",
  medium: "REVIEW",
  conflict: "CONFLICT",
};
const SOURCE_BADGE: Record<string, string> = {
  paylocity: "bg-blue-100 text-blue-800",
  phs: "bg-purple-100 text-purple-800",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function MasterSyncPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applyResult, setApplyResult] = useState<{ matched: number; errors: string[] } | null>(null);

  const [activeTab, setActiveTab] = useState<"updates" | "roster" | "events" | "docs" | "history">("updates");
  const [confFilter, setConfFilter] = useState<"all" | "high" | "medium" | "conflict">("all");
  const [groupByEmployee, setGroupByEmployee] = useState(true);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  // Per-row winner overrides for conflicts
  const [winnerOverrides, setWinnerOverrides] = useState<Map<string, string>>(new Map());
  // Deselected rows
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  // Name matching for roster gaps
  const [matchingGap, setMatchingGap] = useState<string | null>(null);
  const [matchSearch, setMatchSearch] = useState("");
  const [employees, setEmployees] = useState<string[]>([]);
  const [savingMatch, setSavingMatch] = useState(false);

  const { data, loading, error } = useFetch<SyncData>(`/api/master-sync?r=${refreshKey}`);
  const { data: syncLogData } = useFetch<{ log: SyncLogEntry[] }>(`/api/sync-log?r=${refreshKey}`);

  async function doRefresh() {
    setRefreshing(true);
    setDeselected(new Set());
    setWinnerOverrides(new Map());
    setApplyResult(null);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch {}
    setRefreshing(false);
  }

  async function loadEmployees() {
    if (employees.length > 0) return;
    try {
      const res = await fetch("/api/employees");
      const d = await res.json();
      setEmployees((d.employees || []).map((e: { name: string }) => e.name).sort());
    } catch {}
  }

  async function handleMapName(gapName: string, trainingName: string) {
    setSavingMatch(true);
    try {
      await fetch("/api/name-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", paylocityName: gapName, trainingName }),
      });
      setMatchingGap(null);
      setMatchSearch("");
      await doRefresh();
    } catch {}
    setSavingMatch(false);
  }

  function getWinner(row: SmartSyncRow): string {
    const key = `${row.employee}|${row.training}`;
    return winnerOverrides.get(key) || row.winner;
  }

  function setConflictWinner(row: SmartSyncRow, date: string) {
    const key = `${row.employee}|${row.training}`;
    setWinnerOverrides((prev) => new Map(prev).set(key, date));
    // Auto-select the row
    setDeselected((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function toggleRow(key: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleEmployee(name: string) {
    setExpandedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleApply(rowsToApply: SmartSyncRow[]) {
    const selected = rowsToApply.filter(
      (r) => !deselected.has(`${r.employee}|${r.training}`)
    );
    if (selected.length === 0) return;

    setApplying(true);
    setApplyError("");
    setApplyResult(null);
    try {
      const fixes = selected.map((r) => ({
        employee: r.employee,
        training: r.training,
        date: getWinner(r),
      }));
      const res = await fetch("/api/master-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes }),
      });
      const result = await res.json();
      if (!res.ok) { setApplyError(result.error || "Sync failed"); }
      else {
        setApplyResult(result);
        await doRefresh();
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Sync failed");
    }
    setApplying(false);
  }

  async function handleFillEventMissing(event: TrainingEvent) {
    setApplying(true);
    setApplyError("");
    try {
      const fixes = event.possiblyMissing.map((emp) => ({
        employee: emp,
        training: event.training,
        date: event.date,
      }));
      const res = await fetch("/api/master-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes }),
      });
      const result = await res.json();
      if (!res.ok) { setApplyError(result.error || "Fill failed"); }
      else {
        setApplyResult(result);
        await doRefresh();
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Fill failed");
    }
    setApplying(false);
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const base = data.rows;
    if (confFilter === "all") return base;
    return base.filter((r) => r.confidence === confFilter);
  }, [data, confFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, SmartSyncRow[]>();
    for (const row of filtered) {
      if (!map.has(row.employee)) map.set(row.employee, []);
      map.get(row.employee)!.push(row);
    }
    return map;
  }, [filtered]);

  const highRows = useMemo(() => data?.rows.filter((r) => r.confidence === "high") || [], [data]);
  const highSelected = highRows.filter((r) => !deselected.has(`${r.employee}|${r.training}`)).length;
  const allSelected = filtered.filter((r) => !deselected.has(`${r.employee}|${r.training}`)).length;

  if (loading) return <Loading message="Analyzing all sources — this may take a moment..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { summary, rosterGaps, trainingEvents, docAudit, docSummary, lastSyncAt } = data;
  const syncLog = syncLogData?.log || [];

  const tabs = [
    { id: "updates" as const, label: "Updates", count: summary.total, icon: Zap },
    { id: "roster" as const, label: "Roster Gaps", count: rosterGaps.fromPaylocity.length + rosterGaps.fromPHS.length, icon: Users },
    { id: "events" as const, label: "Training Events", count: trainingEvents.length, icon: CheckCircle2 },
    { id: "docs" as const, label: "Documentation", count: docSummary.withoutDoc, icon: FileText },
    { id: "history" as const, label: "History", count: syncLog.length, icon: History },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Master Sync</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {lastSyncAt
              ? `Last synced ${new Date(lastSyncAt).toLocaleDateString()} at ${new Date(lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Never synced — run your first sync below"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {highRows.length > 0 && (
            <button
              onClick={() => handleApply(highRows)}
              disabled={applying || highSelected === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Apply {highSelected} High-Confidence
            </button>
          )}
          <button
            onClick={doRefresh}
            disabled={refreshing}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 text-sm font-medium flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Banners ──────────────────────────────────────────────────────────── */}
      {applyResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-semibold text-emerald-700">
            {applyResult.matched} record{applyResult.matched !== 1 ? "s" : ""} written to Training sheet.
            {(applyResult.errors?.length || 0) > 0 && <span className="font-normal text-slate-600"> {applyResult.errors.length} error(s).</span>}
          </span>
          <button onClick={() => setApplyResult(null)} className="ml-auto text-slate-400 hover:text-slate-600"><XCircle className="h-4 w-4" /></button>
        </div>
      )}
      {applyError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <span className="text-sm text-red-700">{applyError}</span>
          <button onClick={() => setApplyError("")} className="ml-auto text-slate-400 hover:text-slate-600"><XCircle className="h-4 w-4" /></button>
        </div>
      )}
      {(!summary.hasPaylocity || !summary.hasPHS) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            {!summary.hasPaylocity && !summary.hasPHS
              ? "Neither Paylocity Import nor PHS Import tabs found in Google Sheets."
              : !summary.hasPaylocity ? "Paylocity Import tab not found — syncing from PHS only."
              : "PHS Import tab not found — syncing from Paylocity only."}
          </p>
        </div>
      )}

      {/* ── Summary cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-emerald-300 transition-colors" onClick={() => { setActiveTab("updates"); setConfFilter("high"); }}>
          <p className="text-2xl font-bold text-emerald-600">{summary.high}</p>
          <p className="text-xs text-slate-500">High Confidence</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Auto-apply safe</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-amber-300 transition-colors" onClick={() => { setActiveTab("updates"); setConfFilter("medium"); }}>
          <p className="text-2xl font-bold text-amber-600">{summary.medium}</p>
          <p className="text-xs text-slate-500">Needs Review</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Single source</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-red-300 transition-colors" onClick={() => { setActiveTab("updates"); setConfFilter("conflict"); }}>
          <p className="text-2xl font-bold text-red-600">{summary.conflicts}</p>
          <p className="text-xs text-slate-500">Conflicts</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Sources disagree</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setActiveTab("roster")}>
          <p className="text-2xl font-bold text-slate-600">{rosterGaps.fromPaylocity.length + rosterGaps.fromPHS.length}</p>
          <p className="text-xs text-slate-500">Roster Gaps</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Not on Training sheet</p>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-700 bg-blue-50/50"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    activeTab === tab.id ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tab: Updates ──────────────────────────────────────────────────── */}
        {activeTab === "updates" && (
          <div>
            {/* Toolbar */}
            <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <div className="flex gap-1.5">
                {(["all", "high", "medium", "conflict"] as const).map((f) => {
                  const counts: Record<string, number> = { all: summary.total, high: summary.high, medium: summary.medium, conflict: summary.conflicts };
                  const colors: Record<string, string> = { all: "bg-slate-800 text-white", high: "bg-emerald-100 text-emerald-800", medium: "bg-amber-100 text-amber-800", conflict: "bg-red-100 text-red-800" };
                  return (
                    <button
                      key={f}
                      onClick={() => setConfFilter(f)}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${confFilter === f ? colors[f] : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {f === "all" ? "All" : f === "high" ? "High" : f === "medium" ? "Review" : "Conflicts"} ({counts[f]})
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer ml-auto">
                <input type="checkbox" checked={groupByEmployee} onChange={(e) => setGroupByEmployee(e.target.checked)} className="rounded" />
                Group by employee
              </label>
              <button onClick={() => setDeselected(new Set())} className="text-xs text-blue-600 hover:underline">Select all</button>
              <button onClick={() => setDeselected(new Set(filtered.map((r) => `${r.employee}|${r.training}`)))} className="text-xs text-slate-400 hover:underline">Deselect all</button>
            </div>

            {filtered.length === 0 ? (
              <div className="py-14 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-400 mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  {summary.total === 0 ? "Training sheet is fully up to date!" : "No items in this category."}
                </p>
              </div>
            ) : groupByEmployee ? (
              <div className="divide-y divide-slate-100">
                {[...grouped.entries()].map(([employee, empRows]) => {
                  const isExpanded = expandedEmployees.has(employee);
                  const selCount = empRows.filter((r) => !deselected.has(`${r.employee}|${r.training}`)).length;
                  const hasConflict = empRows.some((r) => r.confidence === "conflict");
                  return (
                    <div key={employee}>
                      <button onClick={() => toggleEmployee(employee)} className="w-full px-6 py-3 flex items-center gap-3 hover:bg-slate-50 text-left">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                        <span className="font-medium text-slate-900 text-sm">{employee}</span>
                        {hasConflict && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-semibold rounded">CONFLICT</span>}
                        <span className="text-xs text-slate-400">{empRows.length} update{empRows.length !== 1 ? "s" : ""}</span>
                        <span className="ml-auto text-xs text-emerald-600 font-medium">{selCount} selected</span>
                      </button>
                      {isExpanded && <UpdateTable rows={empRows} deselected={deselected} winnerOverrides={winnerOverrides} onToggle={toggleRow} onConflictPick={setConflictWinner} showEmployee={false} />}
                    </div>
                  );
                })}
              </div>
            ) : (
              <UpdateTable rows={filtered} deselected={deselected} winnerOverrides={winnerOverrides} onToggle={toggleRow} onConflictPick={setConflictWinner} showEmployee />
            )}

            {/* Sticky footer */}
            {filtered.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <p className="text-xs text-slate-500">{allSelected} of {filtered.length} selected</p>
                <button
                  onClick={() => handleApply(filtered)}
                  disabled={applying || allSelected === 0}
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-40"
                >
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Apply {allSelected} Record{allSelected !== 1 ? "s" : ""}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Roster Gaps ─────────────────────────────────────────────── */}
        {activeTab === "roster" && (
          <div className="divide-y divide-slate-100">
            {rosterGaps.fromPaylocity.length === 0 && rosterGaps.fromPHS.length === 0 ? (
              <div className="py-14 text-center">
                <Users className="h-10 w-10 mx-auto text-emerald-400 mb-3" />
                <p className="text-sm font-medium text-slate-700">No roster gaps — all names matched!</p>
              </div>
            ) : (
              <>
                {rosterGaps.fromPaylocity.length > 0 && (
                  <div>
                    <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
                      <h3 className="text-xs font-semibold text-blue-800 uppercase tracking-wide">From Paylocity ({rosterGaps.fromPaylocity.length})</h3>
                      <p className="text-xs text-blue-600 mt-0.5">These names appear in Paylocity Import but don&apos;t match any active employee on the Training sheet.</p>
                    </div>
                    <RosterTable gaps={rosterGaps.fromPaylocity} matchingGap={matchingGap} matchSearch={matchSearch} employees={employees} savingMatch={savingMatch} onStartMatch={(n) => { setMatchingGap(n); loadEmployees(); }} onCancelMatch={() => { setMatchingGap(null); setMatchSearch(""); }} onMatchSearch={setMatchSearch} onMapName={handleMapName} />
                  </div>
                )}
                {rosterGaps.fromPHS.length > 0 && (
                  <div>
                    <div className="px-6 py-3 bg-purple-50 border-b border-purple-100">
                      <h3 className="text-xs font-semibold text-purple-800 uppercase tracking-wide">From PHS ({rosterGaps.fromPHS.length})</h3>
                      <p className="text-xs text-purple-600 mt-0.5">These names appear in PHS Import but don&apos;t match any active employee on the Training sheet.</p>
                    </div>
                    <RosterTable gaps={rosterGaps.fromPHS} matchingGap={matchingGap} matchSearch={matchSearch} employees={employees} savingMatch={savingMatch} onStartMatch={(n) => { setMatchingGap(n); loadEmployees(); }} onCancelMatch={() => { setMatchingGap(null); setMatchSearch(""); }} onMatchSearch={setMatchSearch} onMapName={handleMapName} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tab: Training Events ─────────────────────────────────────────── */}
        {activeTab === "events" && (
          <div>
            {trainingEvents.length === 0 ? (
              <div className="py-14 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">No group training events detected (need 3+ attendees on same date).</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {trainingEvents.map((event, idx) => {
                  const isExpanded = expandedEvents.has(idx);
                  return (
                    <div key={idx}>
                      <button
                        onClick={() => setExpandedEvents((prev) => { const next = new Set(prev); isExpanded ? next.delete(idx) : next.add(idx); return next; })}
                        className="w-full px-6 py-4 flex items-start gap-3 hover:bg-slate-50 text-left"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 text-sm">{event.trainingName}</span>
                            <span className="font-mono text-xs text-slate-500">{event.date}</span>
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-semibold rounded">PHS</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {event.attendees.length} confirmed attendees · {event.possiblyMissing.length} possibly missing
                          </p>
                        </div>
                        {event.possiblyMissing.length > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleFillEventMissing(event); }}
                            disabled={applying}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 shrink-0"
                          >
                            {applying ? <Loader2 className="h-3 w-3 animate-spin inline" /> : null}
                            Fill {event.possiblyMissing.length} missing
                          </button>
                        )}
                      </button>
                      {isExpanded && (
                        <div className="px-6 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Confirmed Attendees ({event.attendees.length})</p>
                            <div className="space-y-1">
                              {event.attendees.map((a) => (
                                <div key={a} className="flex items-center gap-1.5 text-xs text-slate-700">
                                  <Check className="h-3 w-3 text-emerald-500" /> {a}
                                </div>
                              ))}
                            </div>
                          </div>
                          {event.possiblyMissing.length > 0 && (
                            <div>
                              <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide mb-2">Possibly Missing ({event.possiblyMissing.length})</p>
                              <div className="space-y-1">
                                {event.possiblyMissing.map((m) => (
                                  <div key={m} className="flex items-center gap-1.5 text-xs text-amber-700">
                                    <AlertTriangle className="h-3 w-3 text-amber-400" /> {m}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Documentation ───────────────────────────────────────────── */}
        {activeTab === "docs" && (
          <div>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <File className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium text-slate-700">{docSummary.withDoc} with documentation</span>
              </div>
              <div className="flex items-center gap-2">
                <FileX className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-500">{docSummary.withoutDoc} date-only (no file)</span>
              </div>
              {docSummary.withDoc + docSummary.withoutDoc > 0 && (
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-xs">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${Math.round(docSummary.withDoc / (docSummary.withDoc + docSummary.withoutDoc) * 100)}%` }}
                  />
                </div>
              )}
            </div>
            {docAudit.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">No PHS records to audit.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3">Training</th>
                      <th className="px-5 py-3">PHS Date</th>
                      <th className="px-5 py-3">Documentation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {docAudit.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5 font-medium text-slate-900">{row.employee}</td>
                        <td className="px-5 py-2.5 font-mono text-xs text-slate-600">{row.training}</td>
                        <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{row.phsDate}</td>
                        <td className="px-5 py-2.5">
                          {row.hasDoc ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
                              <File className="h-3 w-3" /> Has file
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <FileX className="h-3 w-3" /> Date only
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: History ─────────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <div>
            {syncLog.length === 0 ? (
              <div className="py-14 text-center">
                <Clock className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">No sync history yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="px-5 py-3">Date & Time</th>
                      <th className="px-5 py-3">Source</th>
                      <th className="px-5 py-3">Applied</th>
                      <th className="px-5 py-3">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {syncLog.map((entry, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-600">
                          {new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${entry.source === "master-sync" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                            {entry.source}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-semibold text-emerald-700">{entry.applied}</td>
                        <td className="px-5 py-3 text-red-600">{entry.errors || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface UpdateTableProps {
  rows: SmartSyncRow[];
  deselected: Set<string>;
  winnerOverrides: Map<string, string>;
  onToggle: (key: string) => void;
  onConflictPick: (row: SmartSyncRow, date: string) => void;
  showEmployee: boolean;
}

function UpdateTable({ rows, deselected, winnerOverrides, onToggle, onConflictPick, showEmployee }: UpdateTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
            <th className="px-4 py-2.5 w-8"></th>
            {showEmployee && <th className="px-4 py-2.5">Employee</th>}
            <th className="px-4 py-2.5">Training</th>
            <th className="px-4 py-2.5">Current</th>
            <th className="px-4 py-2.5"></th>
            <th className="px-4 py-2.5">Proposed</th>
            <th className="px-4 py-2.5">Confidence</th>
            <th className="px-4 py-2.5">Doc</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r, i) => {
            const key = `${r.employee}|${r.training}`;
            const checked = !deselected.has(key);
            const winner = winnerOverrides.get(key) || r.winner;
            return (
              <tr key={i} className={`hover:bg-blue-50/20 ${!checked ? "opacity-40" : ""}`}>
                <td className="px-4 py-2.5">
                  <input type="checkbox" checked={checked} onChange={() => onToggle(key)} className="rounded border-slate-300" />
                </td>
                {showEmployee && <td className="px-4 py-2.5 font-medium text-slate-900 text-xs">{r.employee}</td>}
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{r.training}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{r.trainingDate}</td>
                <td className="px-4 py-2.5"><ArrowRight className="h-3 w-3 text-slate-300" /></td>
                <td className="px-4 py-2.5">
                  {r.confidence === "conflict" ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => onConflictPick(r, r.paylocityDate)}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${winner === r.paylocityDate ? "bg-blue-600 text-white border-blue-600" : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"}`}
                      >
                        Paylocity: {r.paylocityDate}
                      </button>
                      <button
                        onClick={() => onConflictPick(r, r.phsDate)}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${winner === r.phsDate ? "bg-purple-600 text-white border-purple-600" : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"}`}
                      >
                        PHS: {r.phsDate}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-emerald-700">{winner}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_BADGE[r.winnerSource]}`}>
                        {r.winnerSource === "paylocity" ? "PAY" : "PHS"}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${CONF_BADGE[r.confidence]}`}>
                    {CONF_LABEL[r.confidence]}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {r.winnerSource === "phs" ? (
                    r.phsHasDoc
                      ? <span title="Has documentation"><File className="h-3.5 w-3.5 text-emerald-500" /></span>
                      : <span title="No file attached"><FileX className="h-3.5 w-3.5 text-slate-300" /></span>
                  ) : <span className="text-slate-200">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface RosterTableProps {
  gaps: RosterGap[];
  matchingGap: string | null;
  matchSearch: string;
  employees: string[];
  savingMatch: boolean;
  onStartMatch: (name: string) => void;
  onCancelMatch: () => void;
  onMatchSearch: (s: string) => void;
  onMapName: (gap: string, training: string) => void;
}

function RosterTable({ gaps, matchingGap, matchSearch, employees, savingMatch, onStartMatch, onCancelMatch, onMatchSearch, onMapName }: RosterTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
            <th className="px-5 py-3">Name in Import</th>
            <th className="px-5 py-3">Most Recent Training</th>
            <th className="px-5 py-3">Date</th>
            <th className="px-5 py-3">Records</th>
            <th className="px-5 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {gaps.map((g, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-5 py-3 font-medium text-slate-900">{g.name}</td>
              <td className="px-5 py-3 font-mono text-xs text-slate-600">{g.recentTraining}</td>
              <td className="px-5 py-3 font-mono text-xs text-slate-500">{g.recentDate}</td>
              <td className="px-5 py-3 text-slate-500 text-xs">{g.occurrences}</td>
              <td className="px-5 py-3">
                {matchingGap === g.name ? (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={matchSearch}
                        onChange={(e) => onMatchSearch(e.target.value)}
                        placeholder="Search Training sheet..."
                        className="w-48 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      {matchSearch && employees.length > 0 && (
                        <div className="absolute z-10 top-full left-0 w-56 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {employees.filter((e) => e.toLowerCase().includes(matchSearch.toLowerCase())).slice(0, 12).map((emp) => (
                            <button key={emp} onClick={() => onMapName(g.name, emp)} disabled={savingMatch} className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-slate-700">
                              {emp}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={onCancelMatch} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => onStartMatch(g.name)} className="px-2 py-1 text-[11px] font-medium rounded bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700">
                    Map Name
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
