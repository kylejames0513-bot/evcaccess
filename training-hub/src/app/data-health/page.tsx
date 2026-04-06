"use client";

import { useState } from "react";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Users,
  FileWarning,
  UserX,
  CalendarX,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
  Wrench,
} from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface GarbledDate { row: number; name: string; column: string; value: string; }
interface DuplicateEmployee { name: string; rows: number[]; }
interface CprFaMismatch { row: number; name: string; cprDate: string; faDate: string; }

interface DataHealthResponse {
  issues: {
    garbledDates: GarbledDate[];
    duplicateEmployees: DuplicateEmployee[];
    cprFaMismatch: CprFaMismatch[];
    emptyRows: number[];
    missingNames: number[];
  };
  summary: { total: number; garbled: number; duplicates: number; mismatches: number; empty: number; missing: number; };
}

function Section({ title, count, icon: Icon, action, children }: {
  title: string; count: number; icon: React.ComponentType<{ className?: string }>; action?: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);
  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity">
          {open ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
          <Icon className="h-4 w-4 text-slate-500 shrink-0" />
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${count > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {count > 0 ? `${count} issue${count !== 1 ? "s" : ""}` : "Clean"}
          </span>
        </button>
        {open && action && <div className="shrink-0">{action}</div>}
      </div>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

export default function DataHealthPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error } = useFetch<DataHealthResponse>(`/api/data-health?r=${refreshKey}`);

  // Garbled dates state
  const [selectedGarbled, setSelectedGarbled] = useState<Set<string>>(new Set());
  const [clearingGarbled, setClearingGarbled] = useState(false);

  // Duplicate state — which row to keep per group
  const [keepRows, setKeepRows] = useState<Record<string, number>>({});
  const [removingDupe, setRemovingDupe] = useState<string | null>(null);

  // CPR/FA state
  const [fixingCpr, setFixingCpr] = useState(false);
  const [fixingCprRow, setFixingCprRow] = useState<number | null>(null);

  if (loading) return <Loading message="Scanning training data..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { issues, summary } = data;

  async function doRefresh() {
    setRefreshing(true);
    try { await fetch("/api/refresh", { method: "POST" }); setRefreshKey((k) => k + 1); } catch {}
    setRefreshing(false);
    setSelectedGarbled(new Set());
    setKeepRows({});
  }

  // ── Garbled dates actions ──
  function toggleGarbled(key: string) {
    const next = new Set(selectedGarbled);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedGarbled(next);
  }
  function toggleAllGarbled() {
    if (selectedGarbled.size === issues.garbledDates.length) setSelectedGarbled(new Set());
    else setSelectedGarbled(new Set(issues.garbledDates.map((d) => `${d.row}|${d.column}`)));
  }

  async function handleClearGarbled() {
    setClearingGarbled(true);
    try {
      const items = Array.from(selectedGarbled).map((k) => { const [row, column] = k.split("|"); return { row: parseInt(row), column }; });
      await fetch("/api/data-health-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear_garbled", items }) });
      doRefresh();
    } catch {}
    setClearingGarbled(false);
  }

  // ── Duplicate actions ──
  async function handleRemoveDupe(name: string, rows: number[]) {
    const keep = keepRows[name];
    if (!keep) return;
    setRemovingDupe(name);
    try {
      const deleteRows = rows.filter((r) => r !== keep);
      await fetch("/api/data-health-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_duplicates", keepRow: keep, deleteRows }) });
      doRefresh();
    } catch {}
    setRemovingDupe(null);
  }

  // ── CPR/FA actions ──
  async function handleFixAllCpr() {
    setFixingCpr(true);
    try {
      await fetch("/api/data-health-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fix_cpr_fa", items: issues.cprFaMismatch.map((d) => ({ row: d.row })) }) });
      doRefresh();
    } catch {}
    setFixingCpr(false);
  }

  async function handleFixOneCpr(row: number) {
    setFixingCprRow(row);
    try {
      await fetch("/api/data-health-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fix_cpr_fa", items: [{ row }] }) });
      doRefresh();
    } catch {}
    setFixingCprRow(null);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Health</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {summary.total === 0 ? "No issues found" : `${summary.total} issue${summary.total !== 1 ? "s" : ""} found`}
          </p>
        </div>
        <button onClick={doRefresh} disabled={refreshing} className="ml-auto px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 text-sm font-medium flex items-center gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh Scan
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Garbled Dates" value={summary.garbled} icon={summary.garbled > 0 ? CalendarX : CheckCircle2} color={summary.garbled > 0 ? "red" : "green"} />
        <StatCard title="Duplicates" value={summary.duplicates} icon={summary.duplicates > 0 ? Copy : CheckCircle2} color={summary.duplicates > 0 ? "red" : "green"} />
        <StatCard title="CPR/FA Mismatch" value={summary.mismatches} icon={summary.mismatches > 0 ? AlertTriangle : CheckCircle2} color={summary.mismatches > 0 ? "yellow" : "green"} />
        <StatCard title="Empty Rows" value={summary.empty} icon={summary.empty > 0 ? FileWarning : CheckCircle2} color={summary.empty > 0 ? "yellow" : "green"} />
        <StatCard title="Missing Names" value={summary.missing} icon={summary.missing > 0 ? UserX : CheckCircle2} color={summary.missing > 0 ? "yellow" : "green"} />
      </div>

      <div className="space-y-3">
        {/* ── Garbled Dates ── */}
        <Section
          title="Garbled Dates" count={issues.garbledDates.length} icon={CalendarX}
          action={selectedGarbled.size > 0 ? (
            <button onClick={handleClearGarbled} disabled={clearingGarbled} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
              {clearingGarbled ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Clear {selectedGarbled.size} Selected
            </button>
          ) : null}
        >
          {issues.garbledDates.length === 0 ? (
            <p className="text-sm text-slate-500">All date values are valid.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="pb-2 pr-2 w-8">
                      <input type="checkbox" checked={selectedGarbled.size === issues.garbledDates.length} onChange={toggleAllGarbled} className="rounded border-slate-300" />
                    </th>
                    <th className="pb-2 pr-4">Row</th>
                    <th className="pb-2 pr-4">Employee</th>
                    <th className="pb-2 pr-4">Column</th>
                    <th className="pb-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.garbledDates.map((d, i) => {
                    const key = `${d.row}|${d.column}`;
                    const checked = selectedGarbled.has(key);
                    return (
                      <tr key={i} className={`border-b border-slate-50 last:border-0 ${checked ? "bg-red-50/50" : ""}`}>
                        <td className="py-2 pr-2"><input type="checkbox" checked={checked} onChange={() => toggleGarbled(key)} className="rounded border-slate-300" /></td>
                        <td className="py-2 pr-4 text-slate-500 font-mono text-xs">{d.row}</td>
                        <td className="py-2 pr-4 text-slate-800">{d.name}</td>
                        <td className="py-2 pr-4 text-slate-600 font-mono text-xs">{d.column}</td>
                        <td className="py-2"><span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-mono">{d.value.substring(0, 50)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── Duplicate Employees ── */}
        <Section title="Duplicate Employees" count={issues.duplicateEmployees.length} icon={Users}>
          {issues.duplicateEmployees.length === 0 ? (
            <p className="text-sm text-slate-500">No duplicates found.</p>
          ) : (
            <div className="space-y-4">
              {issues.duplicateEmployees.map((d) => (
                <div key={d.name} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-800">{d.name}</span>
                    <button
                      onClick={() => handleRemoveDupe(d.name, d.rows)}
                      disabled={!keepRows[d.name] || removingDupe === d.name}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
                    >
                      {removingDupe === d.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      Remove Duplicate{d.rows.length > 2 ? "s" : ""}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {d.rows.map((row) => (
                      <label key={row} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-xs ${keepRows[d.name] === row ? "bg-emerald-50 text-emerald-800" : keepRows[d.name] && keepRows[d.name] !== row ? "bg-red-50/50 text-red-600 line-through" : "hover:bg-slate-50 text-slate-600"}`}>
                        <input type="radio" name={`keep-${d.name}`} checked={keepRows[d.name] === row} onChange={() => setKeepRows({ ...keepRows, [d.name]: row })} className="text-blue-600" />
                        Row {row} {keepRows[d.name] === row ? "(keep)" : keepRows[d.name] ? "(remove)" : ""}
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">Training dates from removed rows are merged into the kept row (newest wins).</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── CPR/FA Mismatch ── */}
        <Section
          title="CPR/FA Date Mismatch" count={issues.cprFaMismatch.length} icon={AlertTriangle}
          action={issues.cprFaMismatch.length > 0 ? (
            <button onClick={handleFixAllCpr} disabled={fixingCpr} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {fixingCpr ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
              Fix All ({issues.cprFaMismatch.length})
            </button>
          ) : null}
        >
          {issues.cprFaMismatch.length === 0 ? (
            <p className="text-sm text-slate-500">All CPR and First Aid dates match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="pb-2 pr-4">Row</th>
                    <th className="pb-2 pr-4">Employee</th>
                    <th className="pb-2 pr-4">CPR</th>
                    <th className="pb-2 pr-4">First Aid</th>
                    <th className="pb-2 pr-4">Fix Preview</th>
                    <th className="pb-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {issues.cprFaMismatch.map((d) => (
                    <tr key={d.row} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 pr-4 text-slate-500 font-mono text-xs">{d.row}</td>
                      <td className="py-2 pr-4 text-slate-800">{d.name}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-emerald-700">{d.cprDate}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-red-600"><s>{d.faDate || "(empty)"}</s></td>
                      <td className="py-2 pr-4 font-mono text-xs text-slate-500">→ {d.cprDate}</td>
                      <td className="py-2">
                        <button
                          onClick={() => handleFixOneCpr(d.row)}
                          disabled={fixingCprRow === d.row || fixingCpr}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                        >
                          {fixingCprRow === d.row ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                          Fix
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── Empty Rows ── */}
        <Section title="Empty Rows" count={issues.emptyRows.length} icon={FileWarning}>
          {issues.emptyRows.length === 0 ? <p className="text-sm text-slate-500">No empty rows.</p> : (
            <p className="text-sm text-slate-700"><span className="text-slate-500">Rows: </span><span className="font-mono text-xs">{issues.emptyRows.join(", ")}</span></p>
          )}
        </Section>

        {/* ── Missing Names ── */}
        <Section title="Missing First Names" count={issues.missingNames.length} icon={UserX}>
          {issues.missingNames.length === 0 ? <p className="text-sm text-slate-500">All employees have names.</p> : (
            <p className="text-sm text-slate-700"><span className="text-slate-500">Rows: </span><span className="font-mono text-xs">{issues.missingNames.join(", ")}</span></p>
          )}
        </Section>
      </div>
    </div>
  );
}
