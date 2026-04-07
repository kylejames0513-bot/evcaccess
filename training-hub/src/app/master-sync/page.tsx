"use client";

import { useState, useMemo } from "react";
import {
  RefreshCw,
  Loader2,
  Check,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface SyncRow {
  employee: string;
  training: string;
  trainingDate: string;
  paylocityDate: string;
  phsDate: string;
  winner: string;
  winnerSource: "training" | "paylocity" | "phs";
  needsUpdate: boolean;
}

interface SyncData {
  rows: SyncRow[];
  summary: {
    total: number;
    fromPaylocity: number;
    fromPHS: number;
    employeesAffected: number;
    hasPaylocity: boolean;
    hasPHS: boolean;
  };
}

const SOURCE_COLORS: Record<string, string> = {
  paylocity: "bg-blue-100 text-blue-800",
  phs: "bg-purple-100 text-purple-800",
  training: "bg-emerald-100 text-emerald-700",
};
const SOURCE_LABELS: Record<string, string> = {
  paylocity: "Paylocity",
  phs: "PHS",
  training: "Training",
};

export default function MasterSyncPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applyResult, setApplyResult] = useState<{ matched: number; errors: string[] } | null>(null);

  // Row selection
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  // Filters
  const [sourceFilter, setSourceFilter] = useState<"all" | "paylocity" | "phs">("all");
  const [groupByEmployee, setGroupByEmployee] = useState(true);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());

  const { data, loading, error } = useFetch<SyncData>(`/api/master-sync?r=${refreshKey}`);

  async function doRefresh() {
    setRefreshing(true);
    setDeselected(new Set());
    setApplyResult(null);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch {}
    setRefreshing(false);
  }

  async function handleApply() {
    if (!data) return;
    const toApply = filtered.filter((r) => !deselected.has(`${r.employee}|${r.training}`));
    if (toApply.length === 0) return;

    setApplying(true);
    setApplyError("");
    setApplyResult(null);

    try {
      const fixes = toApply.map((r) => ({
        employee: r.employee,
        training: r.training,
        date: r.winner,
      }));
      const res = await fetch("/api/master-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes }),
      });
      const result = await res.json();
      if (!res.ok) {
        setApplyError(result.error || "Sync failed");
      } else {
        setApplyResult(result);
        await doRefresh();
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Sync failed");
    }
    setApplying(false);
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

  const filtered = useMemo(() => {
    if (!data) return [];
    if (sourceFilter === "all") return data.rows;
    return data.rows.filter((r) => r.winnerSource === sourceFilter);
  }, [data, sourceFilter]);

  const selectedCount = filtered.filter(
    (r) => !deselected.has(`${r.employee}|${r.training}`)
  ).length;

  // Group by employee
  const grouped = useMemo(() => {
    const map = new Map<string, SyncRow[]>();
    for (const row of filtered) {
      if (!map.has(row.employee)) map.set(row.employee, []);
      map.get(row.employee)!.push(row);
    }
    return map;
  }, [filtered]);

  if (loading) return <Loading message="Reading all sources and building sync preview..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const summary = data.summary;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">Master Sync</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Merges Paylocity + PHS + Training sheet — picks the most recent date for each training record
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selectedCount > 0 && (
            <button
              onClick={handleApply}
              disabled={applying}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Sync {selectedCount} Record{selectedCount !== 1 ? "s" : ""}
            </button>
          )}
          <button
            onClick={doRefresh}
            disabled={refreshing}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 text-sm font-medium flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Result banner */}
      {applyResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold text-emerald-700">
              {applyResult.matched} training record{applyResult.matched !== 1 ? "s" : ""} updated in Training sheet.
            </span>
            {applyResult.errors.length > 0 && (
              <span className="text-slate-600"> {applyResult.errors.length} error(s).</span>
            )}
          </div>
          <button onClick={() => setApplyResult(null)} className="ml-auto text-slate-400 hover:text-slate-600">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {applyError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <span className="text-sm text-red-700">{applyError}</span>
          <button onClick={() => setApplyError("")} className="ml-auto text-slate-400 hover:text-slate-600">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Source availability notice */}
      {(!summary.hasPaylocity || !summary.hasPHS) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            {!summary.hasPaylocity && !summary.hasPHS
              ? "Neither Paylocity Import nor PHS Import tabs found. Add them to Google Sheets to enable full sync."
              : !summary.hasPaylocity
              ? "Paylocity Import tab not found — syncing from PHS only."
              : "PHS Import tab not found — syncing from Paylocity only."}
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">{summary.total}</p>
          <p className="text-xs text-slate-500">Updates Found</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-700">{summary.employeesAffected}</p>
          <p className="text-xs text-slate-500">Employees Affected</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-blue-600">{summary.fromPaylocity}</p>
          <p className="text-xs text-slate-500">From Paylocity</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-purple-600">{summary.fromPHS}</p>
          <p className="text-xs text-slate-500">From PHS</p>
        </div>
      </div>

      {/* No updates needed */}
      {summary.total === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Training sheet is up to date</h2>
          <p className="text-sm text-slate-500">
            All dates in the Training sheet are already the most recent across Paylocity and PHS.
          </p>
        </div>
      )}

      {/* Table */}
      {summary.total > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Source filter */}
              <button
                onClick={() => setSourceFilter("all")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${sourceFilter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                All ({data.rows.length})
              </button>
              <button
                onClick={() => setSourceFilter("paylocity")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${sourceFilter === "paylocity" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Paylocity ({summary.fromPaylocity})
              </button>
              <button
                onClick={() => setSourceFilter("phs")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${sourceFilter === "phs" ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                PHS ({summary.fromPHS})
              </button>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={groupByEmployee}
                  onChange={(e) => setGroupByEmployee(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Group by employee
              </label>
              <button
                onClick={() => setDeselected(new Set())}
                className="text-xs text-blue-600 hover:underline"
              >
                Select all
              </button>
              <button
                onClick={() =>
                  setDeselected(new Set(filtered.map((r) => `${r.employee}|${r.training}`)))
                }
                className="text-xs text-slate-400 hover:underline"
              >
                Deselect all
              </button>
            </div>
          </div>

          {groupByEmployee ? (
            // ── Grouped view ─────────────────────────────────────────────────
            <div className="divide-y divide-slate-100">
              {[...grouped.entries()].map(([employee, empRows]) => {
                const isExpanded = expandedEmployees.has(employee);
                const selectedInGroup = empRows.filter(
                  (r) => !deselected.has(`${r.employee}|${r.training}`)
                ).length;
                return (
                  <div key={employee}>
                    <button
                      onClick={() => toggleEmployee(employee)}
                      className="w-full px-6 py-3 flex items-center gap-3 hover:bg-slate-50 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      <span className="font-medium text-slate-900 text-sm">{employee}</span>
                      <span className="text-xs text-slate-400">
                        {empRows.length} update{empRows.length !== 1 ? "s" : ""}
                      </span>
                      <span className="ml-auto text-xs text-emerald-600 font-medium">
                        {selectedInGroup} selected
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="overflow-x-auto border-t border-slate-50">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide bg-slate-50">
                              <th className="px-5 py-2 w-8"></th>
                              <th className="px-5 py-2">Training</th>
                              <th className="px-5 py-2">Current Date</th>
                              <th className="px-5 py-2">Paylocity</th>
                              <th className="px-5 py-2">PHS</th>
                              <th className="px-5 py-2">Best Date</th>
                              <th className="px-5 py-2">Source</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {empRows.map((r, i) => {
                              const key = `${r.employee}|${r.training}`;
                              const checked = !deselected.has(key);
                              return (
                                <tr
                                  key={i}
                                  className={`hover:bg-blue-50/20 ${!checked ? "opacity-40" : ""}`}
                                >
                                  <td className="px-5 py-2.5">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleRow(key)}
                                      className="rounded border-slate-300"
                                    />
                                  </td>
                                  <td className="px-5 py-2.5 font-mono text-xs text-slate-700">{r.training}</td>
                                  <td className="px-5 py-2.5 font-mono text-xs text-slate-400">{r.trainingDate}</td>
                                  <td className="px-5 py-2.5 font-mono text-xs text-blue-700">{r.paylocityDate || "—"}</td>
                                  <td className="px-5 py-2.5 font-mono text-xs text-purple-700">{r.phsDate || "—"}</td>
                                  <td className="px-5 py-2.5 font-mono text-xs font-semibold text-emerald-700">{r.winner}</td>
                                  <td className="px-5 py-2.5">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[r.winnerSource]}`}>
                                      {SOURCE_LABELS[r.winnerSource]}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // ── Flat view ────────────────────────────────────────────────────
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="px-5 py-3 w-8"></th>
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">Training</th>
                    <th className="px-5 py-3">Current Date</th>
                    <th className="px-5 py-3">Paylocity</th>
                    <th className="px-5 py-3">PHS</th>
                    <th className="px-5 py-3">Best Date</th>
                    <th className="px-5 py-3">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((r, i) => {
                    const key = `${r.employee}|${r.training}`;
                    const checked = !deselected.has(key);
                    return (
                      <tr key={i} className={`hover:bg-blue-50/20 ${!checked ? "opacity-40" : ""}`}>
                        <td className="px-5 py-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRow(key)}
                            className="rounded border-slate-300"
                          />
                        </td>
                        <td className="px-5 py-3 font-medium text-slate-900">{r.employee}</td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-600">{r.training}</td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-400">{r.trainingDate}</td>
                        <td className="px-5 py-3 font-mono text-xs text-blue-700">{r.paylocityDate || "—"}</td>
                        <td className="px-5 py-3 font-mono text-xs text-purple-700">{r.phsDate || "—"}</td>
                        <td className="px-5 py-3 font-mono text-xs font-semibold text-emerald-700">{r.winner}</td>
                        <td className="px-5 py-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[r.winnerSource]}`}>
                            {SOURCE_LABELS[r.winnerSource]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sticky footer */}
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {selectedCount} of {filtered.length} records selected
            </p>
            <button
              onClick={handleApply}
              disabled={applying || selectedCount === 0}
              className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-40 shadow-sm"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Sync {selectedCount} Record{selectedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
