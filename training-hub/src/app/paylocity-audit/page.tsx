"use client";

import { useState } from "react";
import { RefreshCw, AlertTriangle, ArrowRight, Loader2, Check, XCircle } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface Discrepancy {
  employee: string;
  training: string;
  trainingSheetDate: string;
  paylocityDate: string;
  issue: string;
}

interface AuditData {
  discrepancies: Discrepancy[];
  noMatch: Array<{ name: string; skill: string; date: string }>;
  summary: {
    total: number;
    mismatches: number;
    missingOnTraining: number;
    naButHasDate: number;
    noMatchCount: number;
  };
}

const ISSUE_LABELS: Record<string, string> = {
  mismatch: "Date Mismatch",
  missing_on_training: "Missing on Training",
  na_but_has_date: "NA but Paylocity has date",
};
const ISSUE_COLORS: Record<string, string> = {
  mismatch: "bg-red-100 text-red-800",
  missing_on_training: "bg-amber-100 text-amber-800",
  na_but_has_date: "bg-blue-100 text-blue-800",
};

export default function PaylocityAuditPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixFilter, setFixFilter] = useState<string>("all");

  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [fixError, setFixError] = useState("");
  const [matchingName, setMatchingName] = useState<string | null>(null);
  const [matchSearch, setMatchSearch] = useState("");
  const [employees, setEmployees] = useState<string[]>([]);
  const [savingMatch, setSavingMatch] = useState(false);

  const { data, loading, error } = useFetch<AuditData>(`/api/paylocity-audit?r=${refreshKey}`);

  if (loading) return <Loading message="Comparing Training sheet with Paylocity Import..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const discrepancies = data.discrepancies || [];
  const noMatch = data.noMatch || [];
  const summary = data.summary || { total: 0, mismatches: 0, missingOnTraining: 0, naButHasDate: 0, noMatchCount: 0 };

  async function doRefresh() {
    setRefreshing(true);
    try { await fetch("/api/refresh", { method: "POST" }); setRefreshKey((k) => k + 1); } catch {}
    setRefreshing(false);
  }

  async function handleFix(d: Discrepancy) {
    const key = `${d.employee}|${d.training}`;
    setFixing(key);
    setFixError("");
    try {
      const res = await fetch("/api/paylocity-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes: [{ employee: d.employee, training: d.training, date: d.paylocityDate }] }),
      });
      const data = await res.json();
      if (!res.ok) { setFixError(data.error || "Fix failed"); }
      else { await doRefresh(); }
    } catch (err) { setFixError(err instanceof Error ? err.message : "Fix failed"); }
    setFixing(null);
  }

  async function handleFixAll(items: Discrepancy[]) {
    setFixing("all");
    setFixError("");
    try {
      const fixes = items.map((d) => ({ employee: d.employee, training: d.training, date: d.paylocityDate }));
      const res = await fetch("/api/paylocity-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes }),
      });
      const data = await res.json();
      if (!res.ok) { setFixError(data.error || "Fix failed"); }
      else {
        setFixError("");
        await doRefresh();
      }
    } catch (err) { setFixError(err instanceof Error ? err.message : "Fix failed"); }
    setFixing(null);
  }

  async function loadEmployees() {
    if (employees.length > 0) return;
    try {
      const res = await fetch("/api/employees");
      const data = await res.json();
      setEmployees((data.employees || []).map((e: { name: string }) => e.name).sort());
    } catch {}
  }

  async function handleMapName(paylocityName: string, trainingName: string) {
    setSavingMatch(true);
    try {
      await fetch("/api/name-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", paylocityName, trainingName }),
      });
      setMatchingName(null);
      setMatchSearch("");
      await doRefresh();
    } catch {}
    setSavingMatch(false);
  }

  const filtered = fixFilter === "all" ? discrepancies : discrepancies.filter((d) => d.issue === fixFilter);
  const issueTypes = [...new Set(discrepancies.map((d) => d.issue))];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paylocity Audit</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Comparing Training sheet vs Paylocity Import — {summary.total} discrepancies found
          </p>
        </div>
        <button onClick={doRefresh} disabled={refreshing} className="ml-auto px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 text-sm font-medium flex items-center gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-red-600">{summary.mismatches}</p>
          <p className="text-xs text-slate-500">Date Mismatches</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-amber-600">{summary.missingOnTraining}</p>
          <p className="text-xs text-slate-500">Missing on Training</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-blue-600">{summary.naButHasDate}</p>
          <p className="text-xs text-slate-500">NA with Paylocity Date</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-600">{summary.noMatchCount}</p>
          <p className="text-xs text-slate-500">No Name Match</p>
        </div>
      </div>

      {/* Discrepancies */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Discrepancies</h2>
          <div className="flex items-center gap-2">
            {filtered.length > 0 && (
              <button
                onClick={() => handleFixAll(filtered)}
                disabled={fixing === "all"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {fixing === "all" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Fix All {fixFilter !== "all" ? ISSUE_LABELS[fixFilter] : ""} ({filtered.length})
              </button>
            )}
          </div>
        </div>

        {fixError && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700 font-medium">{fixError}</div>
        )}

        {/* Filter tabs */}
        <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-1.5">
          <button
            onClick={() => setFixFilter("all")}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${fixFilter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            All ({discrepancies.length})
          </button>
          {issueTypes.map((type) => {
            const count = discrepancies.filter((d) => d.issue === type).length;
            return (
              <button
                key={type}
                onClick={() => setFixFilter(type)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${fixFilter === type ? ISSUE_COLORS[type] || "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {ISSUE_LABELS[type] || type} ({count})
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">
            {discrepancies.length === 0 ? "Training sheet matches Paylocity Import — no discrepancies!" : "No discrepancies in this category."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Training</th>
                  <th className="px-5 py-3">Training Sheet</th>
                  <th className="px-5 py-3"></th>
                  <th className="px-5 py-3">Paylocity</th>
                  <th className="px-5 py-3">Issue</th>
                  <th className="px-5 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((d, i) => {
                  const key = `${d.employee}|${d.training}`;
                  const isResolved = resolved.has(key);
                  const hasBothDates = d.issue === "mismatch" && d.trainingSheetDate !== "(empty)";
                  return (
                    <tr key={i} className={`hover:bg-blue-50/30 ${isResolved ? "opacity-40" : ""}`}>
                      <td className="px-5 py-3 font-medium text-slate-900">{d.employee}</td>
                      <td className="px-5 py-3 text-slate-600 font-mono text-xs">{d.training}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-xs ${d.issue === "mismatch" ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                            {d.trainingSheetDate}
                          </span>
                          {hasBothDates && !isResolved && (
                            <button
                              onClick={() => { setResolved(new Set([...resolved, key])); }}
                              disabled={!!fixing}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
                              title="Keep this date"
                            >
                              <Check className="h-2.5 w-2.5" /> Keep
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3"><ArrowRight className="h-3 w-3 text-slate-300" /></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-emerald-700 font-semibold">{d.paylocityDate}</span>
                          {!isResolved && (
                            <button
                              onClick={() => handleFix(d)}
                              disabled={!!fixing}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                              title="Use this date"
                            >
                              {fixing === key ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
                              Use
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isResolved ? "bg-emerald-100 text-emerald-700" : ISSUE_COLORS[d.issue] || "bg-slate-100 text-slate-600"}`}>
                          {isResolved ? "Kept" : ISSUE_LABELS[d.issue] || d.issue}
                        </span>
                      </td>
                      <td className="px-5 py-3"></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* No Match */}
      {noMatch.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">No Name Match ({summary.noMatchCount})</h2>
            <p className="text-xs text-slate-500 mt-0.5">Click &quot;Match&quot; to link a Paylocity name to a Training sheet employee. Saved permanently.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-5 py-3">Paylocity Name</th>
                  <th className="px-5 py-3">Skill</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Match To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {noMatch.map((n, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3 text-slate-900">{n.name}</td>
                    <td className="px-5 py-3 text-slate-600">{n.skill}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{n.date}</td>
                    <td className="px-5 py-3">
                      {matchingName === n.name ? (
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <input
                              type="text"
                              value={matchSearch}
                              onChange={(e) => setMatchSearch(e.target.value)}
                              onFocus={loadEmployees}
                              placeholder="Search employee..."
                              className="w-44 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                            {matchSearch && employees.length > 0 && (
                              <div className="absolute z-10 top-full left-0 w-56 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                {employees
                                  .filter((e) => e.toLowerCase().includes(matchSearch.toLowerCase()))
                                  .slice(0, 15)
                                  .map((emp) => (
                                    <button
                                      key={emp}
                                      onClick={() => handleMapName(n.name, emp)}
                                      disabled={savingMatch}
                                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-slate-700"
                                    >
                                      {emp}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                          <button onClick={() => { setMatchingName(null); setMatchSearch(""); }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setMatchingName(n.name)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                        >
                          Match
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
