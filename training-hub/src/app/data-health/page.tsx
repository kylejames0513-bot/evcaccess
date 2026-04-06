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

interface GarbledDate { row: number; name: string; column: string; value: string; suggestion: string; category: string; }
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
  const [garbledEdits, setGarbledEdits] = useState<Record<string, string>>({});
  const [clearingGarbled, setClearingGarbled] = useState(false);
  const [garbledColFilter, setGarbledColFilter] = useState<string>("all");
  const [garbledCatFilter, setGarbledCatFilter] = useState<string>("all");
  const [garbledBulkValue, setGarbledBulkValue] = useState("");

  // Duplicate state — which row to keep per group
  const [keepRows, setKeepRows] = useState<Record<string, number>>({});
  const [removingDupe, setRemovingDupe] = useState<string | null>(null);

  // CPR/FA state
  const [fixingCpr, setFixingCpr] = useState(false);
  const [fixingCprRow, setFixingCprRow] = useState<number | null>(null);
  const [cprFixResult, setCprFixResult] = useState("");

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

  function setGarbledEdit(key: string, value: string) {
    setGarbledEdits({ ...garbledEdits, [key]: value });
  }

  function acceptAllSuggestions() {
    const edits: Record<string, string> = { ...garbledEdits };
    for (const d of issues.garbledDates) {
      if (d.suggestion) {
        const key = `${d.row}|${d.column}`;
        edits[key] = d.suggestion;
        selectedGarbled.add(key);
      }
    }
    setGarbledEdits(edits);
    setSelectedGarbled(new Set(selectedGarbled));
  }

  async function handleFixGarbled() {
    setClearingGarbled(true);
    try {
      const items = Array.from(selectedGarbled).map((k) => {
        const [row, column] = k.split("|");
        return { row: parseInt(row), column, newValue: garbledEdits[k] || "" };
      });
      const res = await fetch("/api/data-health-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear_garbled", items }) });
      const data = await res.json();
      if (!res.ok) alert("Fix error: " + (data.error || res.status));
      else await doRefresh();
    } catch (err) {
      alert("Fix error: " + (err instanceof Error ? err.message : "unknown"));
    }
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
    setCprFixResult("");
    try {
      const res = await fetch("/api/data-health-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fix_cpr_fa", items: issues.cprFaMismatch.map((d) => ({ row: d.row })) }) });
      const data = await res.json();
      if (!res.ok) {
        setCprFixResult("API Error: " + (data.error || res.status));
      } else {
        setCprFixResult(data.message || `Fixed ${data.fixed}`);
        await doRefresh();
      }
    } catch (err) {
      setCprFixResult("Network Error: " + (err instanceof Error ? err.message : "unknown"));
    }
    setFixingCpr(false);
  }

  async function handleFixOneCpr(row: number) {
    setFixingCprRow(row);
    try {
      await fetch("/api/data-health-fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fix_cpr_fa", items: [{ row }] }) });
      await doRefresh();
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
          action={issues.garbledDates.length > 0 ? (
            <div className="flex items-center gap-2">
              {issues.garbledDates.some((d) => d.suggestion) && (
                <button onClick={acceptAllSuggestions} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                  <Wrench className="h-3 w-3" /> Accept All Suggestions
                </button>
              )}
              {selectedGarbled.size > 0 && (
                <button onClick={handleFixGarbled} disabled={clearingGarbled} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  {clearingGarbled ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                  Fix {selectedGarbled.size} Selected
                </button>
              )}
            </div>
          ) : null}
        >
          {issues.garbledDates.length === 0 ? (
            <p className="text-sm text-slate-500">All date values are in M/D/YYYY format.</p>
          ) : (() => {
            const CATEGORY_LABELS: Record<string, string> = {
              failed_code: "Failed Codes",
              date_format: "Date Format",
              missing_day: "Missing Day",
              random: "Random/Invalid",
              other: "Other",
            };
            const CATEGORY_COLORS: Record<string, string> = {
              failed_code: "bg-orange-100 text-orange-800",
              date_format: "bg-blue-100 text-blue-800",
              missing_day: "bg-amber-100 text-amber-800",
              random: "bg-red-100 text-red-800",
              other: "bg-slate-100 text-slate-800",
            };

            // Filters
            const columns = [...new Set(issues.garbledDates.map((d) => d.column))].sort();
            const categories = [...new Set(issues.garbledDates.map((d) => d.category))];
            let filtered = issues.garbledDates;
            if (garbledColFilter !== "all") filtered = filtered.filter((d) => d.column === garbledColFilter);
            if (garbledCatFilter !== "all") filtered = filtered.filter((d) => d.category === garbledCatFilter);

            // Group filtered items by value for bulk actions
            const valueGroups: Record<string, GarbledDate[]> = {};
            for (const d of filtered) {
              const short = d.value.length > 25 ? d.value.substring(0, 25) + "..." : d.value;
              if (!valueGroups[short]) valueGroups[short] = [];
              valueGroups[short].push(d);
            }

            return (
              <div className="space-y-3">
                {/* Category filter */}
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">Category</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setGarbledCatFilter("all")}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${garbledCatFilter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      All ({garbledColFilter === "all" ? issues.garbledDates.length : issues.garbledDates.filter((d) => d.column === garbledColFilter).length})
                    </button>
                    {categories.map((cat) => {
                      const catItems = garbledColFilter === "all"
                        ? issues.garbledDates.filter((d) => d.category === cat)
                        : issues.garbledDates.filter((d) => d.category === cat && d.column === garbledColFilter);
                      if (catItems.length === 0) return null;
                      return (
                        <button
                          key={cat}
                          onClick={() => setGarbledCatFilter(cat)}
                          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${garbledCatFilter === cat ? CATEGORY_COLORS[cat] || "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                        >
                          {CATEGORY_LABELS[cat] || cat} ({catItems.length})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Column filter */}
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">Column</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setGarbledColFilter("all")}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${garbledColFilter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      All
                    </button>
                    {columns.map((col) => {
                      const count = garbledCatFilter === "all"
                        ? issues.garbledDates.filter((d) => d.column === col).length
                        : issues.garbledDates.filter((d) => d.column === col && d.category === garbledCatFilter).length;
                      if (count === 0) return null;
                      return (
                        <button
                          key={col}
                          onClick={() => setGarbledColFilter(col)}
                          className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${garbledColFilter === col ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                        >
                          {col} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bulk value setter */}
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-xs text-slate-500 shrink-0">Set all selected to:</span>
                  <input
                    type="text"
                    value={garbledBulkValue}
                    onChange={(e) => setGarbledBulkValue(e.target.value)}
                    placeholder="M/D/YYYY, excusal code, or empty to clear"
                    className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => {
                      const edits = { ...garbledEdits };
                      const sel = new Set(selectedGarbled);
                      for (const d of filtered) {
                        const key = `${d.row}|${d.column}`;
                        edits[key] = garbledBulkValue;
                        sel.add(key);
                      }
                      setGarbledEdits(edits);
                      setSelectedGarbled(sel);
                    }}
                    className="px-3 py-1 text-xs font-medium rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 shrink-0"
                  >
                    Apply to All Filtered ({filtered.length})
                  </button>
                </div>

                {/* Value groups for quick selection */}
                {Object.keys(valueGroups).length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs text-slate-400 self-center mr-1">Quick select by value:</span>
                    {Object.entries(valueGroups).map(([val, items]) => (
                      <button
                        key={val}
                        onClick={() => {
                          const sel = new Set(selectedGarbled);
                          for (const d of items) sel.add(`${d.row}|${d.column}`);
                          setSelectedGarbled(sel);
                        }}
                        className="px-2 py-1 text-[10px] font-mono rounded bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                        title={`Select all ${items.length} with this value`}
                      >
                        {val} ({items.length})
                      </button>
                    ))}
                  </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                        <th className="pb-2 pr-2 w-8">
                          <input type="checkbox" checked={filtered.every((d) => selectedGarbled.has(`${d.row}|${d.column}`))} onChange={() => {
                            const keys = filtered.map((d) => `${d.row}|${d.column}`);
                            const allSelected = keys.every((k) => selectedGarbled.has(k));
                            const next = new Set(selectedGarbled);
                            if (allSelected) keys.forEach((k) => next.delete(k));
                            else keys.forEach((k) => next.add(k));
                            setSelectedGarbled(next);
                          }} className="rounded border-slate-300" />
                        </th>
                        <th className="pb-2 pr-4">Row</th>
                        <th className="pb-2 pr-4">Employee</th>
                        {garbledColFilter === "all" && <th className="pb-2 pr-4">Column</th>}
                        {garbledCatFilter === "all" && <th className="pb-2 pr-4">Type</th>}
                        <th className="pb-2 pr-4">Current Value</th>
                        <th className="pb-2">Fix To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((d, i) => {
                        const key = `${d.row}|${d.column}`;
                        const checked = selectedGarbled.has(key);
                        const editValue = garbledEdits[key] ?? d.suggestion ?? "";
                        return (
                          <tr key={i} className={`border-b border-slate-50 last:border-0 ${checked ? "bg-blue-50/50" : ""}`}>
                            <td className="py-2 pr-2"><input type="checkbox" checked={checked} onChange={() => toggleGarbled(key)} className="rounded border-slate-300" /></td>
                            <td className="py-2 pr-4 text-slate-500 font-mono text-xs">{d.row}</td>
                            <td className="py-2 pr-4 text-slate-800 text-xs">{d.name}</td>
                            {garbledColFilter === "all" && <td className="py-2 pr-4 text-slate-600 font-mono text-xs">{d.column}</td>}
                            {garbledCatFilter === "all" && <td className="py-2 pr-4"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_COLORS[d.category] || "bg-slate-100 text-slate-600"}`}>{CATEGORY_LABELS[d.category] || d.category}</span></td>}
                            <td className="py-2 pr-4"><span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-mono">{d.value.substring(0, 35)}</span></td>
                            <td className="py-2">
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => { setGarbledEdit(key, e.target.value); if (!checked) toggleGarbled(key); }}
                                placeholder={d.suggestion || "M/D/YYYY or empty"}
                                className={`w-28 px-2 py-1 border rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 ${d.suggestion && !garbledEdits[key] ? "border-emerald-300 bg-emerald-50/50 text-emerald-700" : "border-slate-200 text-slate-700"}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
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
          {cprFixResult && (
            <div className={`mb-3 p-3 rounded-lg text-xs font-medium ${cprFixResult.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
              {cprFixResult}
            </div>
          )}
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
