"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import type { NotificationTier } from "@/lib/notifications/tiers";

interface TierPayload {
  tier: NotificationTier;
  days_until: number | null;
  days_overdue: number | null;
}

interface ComplianceRow {
  employee_id: string | null;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
  division: string | null;
  position: string | null;
  job_title: string | null;
  paylocity_id: string | null;
  training_type_id: number | null;
  training_name: string | null;
  status: string | null;
  completion_date: string | null;
  expiration_date: string | null;
  completion_source: string | null;
  excusal_reason: string | null;
  days_overdue: number | null;
  due_in_30: boolean | null;
  due_in_60: boolean | null;
  due_in_90: boolean | null;
  tier?: TierPayload;
}

interface EmployeeGroup {
  employee_id: string;
  first_name: string;
  last_name: string;
  department: string;
  division: string;
  job_title: string;
  position: string;
  paylocity_id: string;
  trainings: ComplianceRow[];
  worstStatus: string;
  completedCount: number;
  totalCount: number;
}

interface Summary {
  total_active_employees: number;
  status_counts: { current: number; expiring_soon: number; expired: number; needed: number; excused: number };
  tier_counts: { due_30: number; due_60: number; due_90: number; overdue: number };
}

interface TrainingTypeOption {
  id: number;
  name: string;
}

type DueWindowKey = "" | "overdue" | "14" | "30" | "60" | "90";

export default function CompliancePage() {
  const router = useRouter();
  const pathname = usePathname();
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("");
  const [trainingTypeId, setTrainingTypeId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [dueWindow, setDueWindow] = useState<DueWindowKey>("");
  const skipFirstUrlSync = useRef(true);
  const [trainingTypes, setTrainingTypes] = useState<TrainingTypeOption[]>([]);
  const [compact, setCompact] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const d = new URLSearchParams(window.location.search).get("due_window");
    if (d === "overdue" || d === "14" || d === "30" || d === "60" || d === "90") setDueWindow(d);
  }, []);

  useEffect(() => {
    if (skipFirstUrlSync.current) {
      skipFirstUrlSync.current = false;
      return;
    }
    const p = new URLSearchParams();
    if (department) p.set("department", department);
    if (position) p.set("position", position);
    if (status) p.set("status", status);
    if (trainingTypeId) p.set("training_type_id", trainingTypeId);
    if (employeeId.trim()) p.set("employee_id", employeeId.trim());
    if (dueWindow) p.set("due_window", dueWindow);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [department, position, status, trainingTypeId, employeeId, dueWindow, pathname, router]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/training-types");
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Failed to load training types");
        const list = (j.training_types ?? []) as { id: number; name: string }[];
        setTrainingTypes(list.map((t) => ({ id: t.id, name: t.name })));
      } catch {
        /* optional filter; leave empty */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (department) params.set("department", department);
      if (position) params.set("position", position);
      if (status) params.set("status", status);
      if (trainingTypeId) params.set("training_type_id", trainingTypeId);
      if (employeeId.trim()) params.set("employee_id", employeeId.trim());
      if (dueWindow) params.set("due_window", dueWindow);
      const r = await fetch(`/api/compliance?${params.toString()}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setRows(j.rows ?? []);
      setSummary(j.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [department, position, status, trainingTypeId, employeeId, dueWindow]);

  useEffect(() => {
    void load();
  }, [load]);

  const employees = useMemo(() => {
    const statusRank: Record<string, number> = { expired: 0, expiring_soon: 1, needed: 2, excused: 3, current: 4 };
    const map = new Map<string, EmployeeGroup>();

    for (const r of rows) {
      const eid = r.employee_id ?? "";
      if (!eid) continue;
      if (!map.has(eid)) {
        map.set(eid, {
          employee_id: eid,
          first_name: r.first_name ?? "",
          last_name: r.last_name ?? "",
          department: r.department ?? "",
          division: r.division ?? "",
          job_title: r.job_title ?? "",
          position: r.position ?? "",
          paylocity_id: r.paylocity_id ?? "",
          trainings: [],
          worstStatus: "current",
          completedCount: 0,
          totalCount: 0,
        });
      }
      const emp = map.get(eid)!;
      emp.trainings.push(r);
      emp.totalCount += 1;
      const st = r.status ?? "current";
      if (st === "current" || st === "excused") emp.completedCount += 1;
      if ((statusRank[st] ?? 4) < (statusRank[emp.worstStatus] ?? 4)) emp.worstStatus = st;
    }

    return [...map.values()].sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  }, [rows]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.department && set.add(r.department));
    rows.forEach((r) => r.division && set.add(r.division));
    return [...set].sort();
  }, [rows]);

  const hasActiveFilters =
    Boolean(department) ||
    Boolean(position) ||
    Boolean(status) ||
    Boolean(trainingTypeId) ||
    Boolean(employeeId.trim()) ||
    Boolean(dueWindow);

  function toggleExpanded(eid: string) {
    const next = new Set(expanded);
    if (next.has(eid)) next.delete(eid);
    else next.add(eid);
    setExpanded(next);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (department) params.set("department", department);
      if (position) params.set("position", position);
      if (status) params.set("status", status);
      if (trainingTypeId) params.set("training_type_id", trainingTypeId);
      if (employeeId.trim()) params.set("employee_id", employeeId.trim());
      if (dueWindow) params.set("due_window", dueWindow);
      params.set("format", "csv");
      const r = await fetch(`/api/compliance?${params.toString()}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `Export failed (${r.status})`);
      }
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition");
      const match = cd?.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `compliance_${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const cell = compact ? "px-3 py-2" : "px-4 py-3";
  const cellSm = compact ? "px-3 py-1.5" : "px-4 py-2";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance</h1>
          {summary && (
            <p className="mt-1 text-sm text-slate-500">{summary.total_active_employees} active employees</p>
          )}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            checked={compact}
            onChange={(e) => setCompact(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Compact rows
        </label>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Fully compliant" value={summary.status_counts.current} color="green" />
          <Stat label="Expiring soon" value={summary.status_counts.expiring_soon} color="yellow" />
          <Stat label="Expired" value={summary.status_counts.expired} color="red" />
          <Stat label="Missing training" value={summary.status_counts.needed} color="amber" />
        </div>
      )}

      {summary && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 tracking-wide mb-2">Due windows (employees)</h2>
          <p className="text-xs text-slate-400 mb-3">
            Counts reflect how many employees have at least one training in each window (same ladder as notifications: overdue,
            then 1–30, 31–60, 61–90 days to expiration).
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Overdue" value={summary.tier_counts.overdue} color="red" />
            <Stat label="Due in 30 days" value={summary.tier_counts.due_30} color="amber" />
            <Stat label="Due in 31–60 days" value={summary.tier_counts.due_60} color="yellow" />
            <Stat label="Due in 61–90 days" value={summary.tier_counts.due_90} color="blue" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide">Scheduler presets</span>
            {(
              [
                { key: "overdue" as const, label: "Overdue rows" },
                { key: "14" as const, label: "2-week notice (exp)" },
                { key: "30" as const, label: "Due in 30d" },
                { key: "60" as const, label: "Due in 31–60d" },
                { key: "90" as const, label: "Due in 61–90d" },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setDueWindow(dueWindow === p.key ? "" : p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  dueWindow === p.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            ))}
            <Link
              href="/schedule"
              className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              Open schedule
            </Link>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 space-y-3">
        <div className="flex flex-wrap gap-4 items-end">
          <label className="block min-w-[140px] flex-1 sm:flex-none">
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide">Department / division</span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[120px] flex-1 sm:flex-none">
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide">Position</span>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="contains…"
              className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </label>
          <label className="block min-w-[120px] flex-1 sm:flex-none">
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All</option>
              <option value="current">Current</option>
              <option value="expiring_soon">Expiring soon</option>
              <option value="expired">Expired</option>
              <option value="needed">Needed</option>
              <option value="excused">Excused</option>
            </select>
          </label>
          <label className="block min-w-[180px] flex-1 sm:flex-none">
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide">Training</span>
            <select
              value={trainingTypeId}
              onChange={(e) => setTrainingTypeId(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All types</option>
              {trainingTypes.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[200px] flex-1 sm:flex-none">
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide">Employee ID</span>
            <input
              type="text"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="UUID to narrow to one person"
              className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono text-xs"
            />
          </label>
          <div className="flex flex-wrap gap-2 ml-auto w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={exporting || loading}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} />}
      {loading && !error && <Loading message="Loading compliance…" />}

      {!loading && !error && (
        <div className="-mx-4 sm:mx-0 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm shadow-sm">
              <tr className="border-b border-slate-200">
                <th className={`${cell} text-left text-[11px] font-semibold tracking-wide text-slate-500 w-8`} />
                <th className={`${cell} text-left text-[11px] font-semibold tracking-wide text-slate-500`}>
                  Employee
                </th>
                <th className={`${cell} text-left text-[11px] font-semibold tracking-wide text-slate-500 hidden md:table-cell`}>
                  Job title
                </th>
                <th className={`${cell} text-left text-[11px] font-semibold tracking-wide text-slate-500`}>
                  Dept
                </th>
                <th className={`${cell} text-left text-[11px] font-semibold tracking-wide text-slate-500 hidden lg:table-cell`}>
                  Position
                </th>
                <th className={`${cell} text-left text-[11px] font-semibold tracking-wide text-slate-500`}>Status</th>
                <th className={`${cell} text-right text-[11px] font-semibold tracking-wide text-slate-500`}>Done</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => {
                const isOpen = expanded.has(emp.employee_id);
                return (
                  <EmployeeRow
                    key={emp.employee_id}
                    emp={emp}
                    isOpen={isOpen}
                    onToggle={() => toggleExpanded(emp.employee_id)}
                    cell={cell}
                    cellSm={cellSm}
                  />
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={7} className={`${cell} text-center text-slate-500`}>
                    {hasActiveFilters
                      ? "No employees match the current filters. Try clearing a filter."
                      : "No compliance rows returned. If you expect data, verify employees and required trainings in Supabase."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmployeeRow({
  emp,
  isOpen,
  onToggle,
  cell,
  cellSm,
}: {
  emp: EmployeeGroup;
  isOpen: boolean;
  onToggle: () => void;
  cell: string;
  cellSm: string;
}) {
  return (
    <>
      <tr className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={onToggle}>
        <td className={`${cell} text-slate-400 align-middle`}>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className={`${cell} align-middle`}>
          <Link
            href={`/employees/${emp.employee_id}`}
            className="text-blue-600 hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {emp.last_name}, {emp.first_name}
          </Link>
          {emp.paylocity_id && <span className="text-slate-400 text-xs ml-1.5">({emp.paylocity_id})</span>}
        </td>
        <td className={`${cell} text-slate-600 hidden md:table-cell align-middle`}>{emp.job_title || "—"}</td>
        <td className={`${cell} text-slate-500 align-middle`}>
          <span className="line-clamp-2">{emp.department || emp.division || "—"}</span>
        </td>
        <td className={`${cell} text-slate-500 hidden lg:table-cell align-middle`}>{emp.position}</td>
        <td className={`${cell} align-middle`}>
          <StatusBadge status={emp.worstStatus} />
        </td>
        <td className={`${cell} text-right align-middle`}>
          <span
            className={`text-sm font-semibold tabular-nums ${emp.completedCount === emp.totalCount ? "text-emerald-700" : "text-slate-900"}`}
          >
            {emp.completedCount}/{emp.totalCount}
          </span>
        </td>
      </tr>
      {isOpen &&
        emp.trainings.map((t, i) => (
          <tr key={`${emp.employee_id}-${t.training_type_id}-${i}`} className="bg-slate-50/60">
            <td className={cellSm} />
            <td className={`${cellSm} pl-8 md:pl-10 text-slate-700`} colSpan={4}>
              {t.training_type_id ? (
                <Link href={`/trainings/${t.training_type_id}`} className="text-blue-600 hover:underline text-xs">
                  {t.training_name}
                </Link>
              ) : (
                <span className="text-xs">{t.training_name}</span>
              )}
              <span className="ml-2 block sm:inline text-xs text-slate-500 mt-0.5 sm:mt-0">
                {t.completion_date ?? "—"}
                {t.expiration_date && <span className="text-slate-400"> → {t.expiration_date}</span>}
                {t.days_overdue != null && t.days_overdue > 0 && (
                  <span className="text-red-600 font-medium ml-1">({t.days_overdue}d overdue)</span>
                )}
                {t.tier?.tier === "due_30" && (
                  <span className="text-amber-700 font-medium ml-1">(due ≤30d)</span>
                )}
                {t.tier?.tier === "due_60" && (
                  <span className="text-amber-600 ml-1">(due 31–60d)</span>
                )}
                {t.tier?.tier === "due_90" && (
                  <span className="text-slate-600 ml-1">(due 61–90d)</span>
                )}
                {t.status === "excused" && t.excusal_reason && (
                  <span className="text-slate-400 ml-1">· {t.excusal_reason}</span>
                )}
              </span>
            </td>
            <td className={cellSm}>
              <StatusBadge status={t.status} />
            </td>
            <td className={`${cellSm} text-right text-xs text-slate-400`}>{t.completion_source ?? ""}</td>
          </tr>
        ))}
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const iconColors: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-600",
    yellow: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
    amber: "bg-orange-50 text-orange-600",
  };
  const dotColor: Record<string, string> = {
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    blue: "bg-blue-500",
    red: "bg-red-500",
    amber: "bg-orange-500",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${iconColors[color] ?? "bg-slate-50 text-slate-500"}`}
      >
        <span className={`block w-2.5 h-2.5 rounded-full ${dotColor[color] ?? "bg-slate-400"}`} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900 leading-tight">{value}</div>
        <div className="text-[11px] font-semibold text-slate-500 tracking-wide mt-0.5">{label}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const colors: Record<string, string> = {
    current: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/10",
    expiring_soon: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10",
    expired: "bg-red-50 text-red-700 ring-1 ring-red-600/10",
    needed: "bg-orange-50 text-orange-700 ring-1 ring-orange-600/10",
    excused: "bg-slate-50 text-slate-600 ring-1 ring-slate-500/10",
  };
  const labels: Record<string, string> = {
    current: "current",
    expiring_soon: "expiring",
    expired: "expired",
    needed: "needed",
    excused: "excused",
  };
  return (
    <span className={`inline-flex items-center text-xs font-medium rounded-md px-2 py-0.5 ${colors[status] ?? colors.excused}`}>
      {labels[status] ?? status}
    </span>
  );
}
