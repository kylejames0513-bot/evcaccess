"use client";

import { useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  Users,
  CalendarX,
  UserX,
  AlertTriangle,
  Loader2,
  Trash2,
  Database,
} from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface DataHealthResponse {
  summary: {
    total: number;
    missingDepartment: number;
    missingHireDate: number;
    badDates: number;
    duplicates: number;
    orphanRecords: number;
    orphanExcusals: number;
    totalEmployees: number;
    totalRecords: number;
    totalExcusals: number;
  };
  issues: {
    missingDepartment: Array<{ id: string; name: string }>;
    missingHireDate: Array<{ id: string; name: string }>;
    badDates: Array<{ recordId: string; employeeId: string; date: string | null }>;
    duplicateEmployees: Array<{ name: string; ids: string[] }>;
    orphanRecords: Array<{ recordId: string; employeeId: string }>;
    orphanExcusals: Array<{ excusalId: string; employeeId: string }>;
  };
}

function Section({
  title,
  count,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);
  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity"
        >
          <Icon className="h-4 w-4 text-slate-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              count > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
            }`}
          >
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
  const [busy, setBusy] = useState<string | null>(null);
  const [keepIds, setKeepIds] = useState<Record<string, string>>({});
  const { data, loading, error } = useFetch<DataHealthResponse>(
    `/api/data-health?r=${refreshKey}`
  );

  if (loading) return <Loading message="Scanning Supabase data..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { summary, issues } = data;

  async function doRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setRefreshKey((k) => k + 1);
    } catch {}
    setRefreshing(false);
  }

  async function deleteOrphanRecords() {
    if (issues.orphanRecords.length === 0) return;
    setBusy("orphan_records");
    try {
      await fetch("/api/data-health-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_orphan_records",
          recordIds: issues.orphanRecords.map((r) => r.recordId),
        }),
      });
      doRefresh();
    } catch {}
    setBusy(null);
  }

  async function deleteOrphanExcusals() {
    if (issues.orphanExcusals.length === 0) return;
    setBusy("orphan_excusals");
    try {
      await fetch("/api/data-health-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_orphan_excusals",
          excusalIds: issues.orphanExcusals.map((e) => e.excusalId),
        }),
      });
      doRefresh();
    } catch {}
    setBusy(null);
  }

  async function deleteBadDateRecord(recordId: string) {
    setBusy(`bad_date_${recordId}`);
    try {
      await fetch("/api/data-health-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_bad_date_record", recordId }),
      });
      doRefresh();
    } catch {}
    setBusy(null);
  }

  async function mergeDuplicates(name: string, ids: string[]) {
    const keepId = keepIds[name];
    if (!keepId) return;
    const removeIds = ids.filter((id) => id !== keepId);
    setBusy(`dup_${name}`);
    try {
      await fetch("/api/data-health-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merge_duplicates",
          keepId,
          removeIds,
        }),
      });
      doRefresh();
    } catch {}
    setBusy(null);
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Quality</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Scans Supabase for missing fields, bad dates, duplicates, and orphan
            records.
          </p>
        </div>
        <button
          onClick={doRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Rescan
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Total Issues"
          value={summary.total}
          icon={AlertTriangle}
          color={summary.total > 0 ? "red" : "green"}
        />
        <StatCard title="Employees" value={summary.totalEmployees} icon={Users} />
        <StatCard
          title="Training Records"
          value={summary.totalRecords}
          icon={Database}
        />
        <StatCard title="Excusals" value={summary.totalExcusals} icon={Database} />
      </div>

      {summary.total === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex items-center gap-4">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0" />
          <div>
            <h3 className="text-base font-semibold text-emerald-900">
              All clean!
            </h3>
            <p className="text-sm text-emerald-700">
              No data quality issues found in Supabase.
            </p>
          </div>
        </div>
      )}

      {/* Missing department */}
      <Section
        title="Employees missing department"
        count={issues.missingDepartment.length}
        icon={Users}
      >
        {issues.missingDepartment.length > 0 ? (
          <ul className="text-sm text-slate-700 space-y-1">
            {issues.missingDepartment.map((e) => (
              <li key={e.id} className="px-3 py-1.5 rounded-lg bg-slate-50">
                {e.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No issues.</p>
        )}
      </Section>

      {/* Missing hire date */}
      <Section
        title="Employees missing hire date"
        count={issues.missingHireDate.length}
        icon={CalendarX}
      >
        {issues.missingHireDate.length > 0 ? (
          <ul className="text-sm text-slate-700 space-y-1">
            {issues.missingHireDate.map((e) => (
              <li key={e.id} className="px-3 py-1.5 rounded-lg bg-slate-50">
                {e.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No issues.</p>
        )}
      </Section>

      {/* Bad dates */}
      <Section
        title="Training records with bad dates"
        count={issues.badDates.length}
        icon={CalendarX}
      >
        {issues.badDates.length > 0 ? (
          <ul className="text-sm text-slate-700 space-y-1">
            {issues.badDates.map((r) => (
              <li
                key={r.recordId}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50"
              >
                <span>
                  Record <code className="text-xs">{r.recordId.slice(0, 8)}…</code> —{" "}
                  date <code className="text-xs">{r.date}</code>
                </span>
                <button
                  onClick={() => deleteBadDateRecord(r.recordId)}
                  disabled={busy === `bad_date_${r.recordId}`}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {busy === `bad_date_${r.recordId}` ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No issues.</p>
        )}
      </Section>

      {/* Duplicates */}
      <Section
        title="Duplicate employees"
        count={issues.duplicateEmployees.length}
        icon={Users}
      >
        {issues.duplicateEmployees.length > 0 ? (
          <div className="space-y-3">
            {issues.duplicateEmployees.map((dup) => {
              const selectedKeep = keepIds[dup.name];
              return (
                <div
                  key={dup.name}
                  className="border border-slate-200 rounded-xl p-3 bg-slate-50"
                >
                  <p className="text-sm font-semibold text-slate-900 mb-2">
                    {dup.name}
                  </p>
                  <div className="space-y-1.5 mb-3">
                    {dup.ids.map((id) => (
                      <label
                        key={id}
                        className="flex items-center gap-2 text-xs text-slate-700"
                      >
                        <input
                          type="radio"
                          name={`keep-${dup.name}`}
                          checked={selectedKeep === id}
                          onChange={() =>
                            setKeepIds((prev) => ({ ...prev, [dup.name]: id }))
                          }
                        />
                        <code className="font-mono">{id}</code>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => mergeDuplicates(dup.name, dup.ids)}
                    disabled={!selectedKeep || busy === `dup_${dup.name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy === `dup_${dup.name}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : null}
                    Merge into selected
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No issues.</p>
        )}
      </Section>

      {/* Orphan records */}
      <Section
        title="Orphan training records"
        count={issues.orphanRecords.length}
        icon={UserX}
        action={
          issues.orphanRecords.length > 0 ? (
            <button
              onClick={deleteOrphanRecords}
              disabled={busy === "orphan_records"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {busy === "orphan_records" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete all
            </button>
          ) : null
        }
      >
        {issues.orphanRecords.length > 0 ? (
          <p className="text-xs text-slate-500">
            Records pointing at deleted/inactive employees:{" "}
            {issues.orphanRecords.length}
          </p>
        ) : (
          <p className="text-sm text-slate-400">No issues.</p>
        )}
      </Section>

      {/* Orphan excusals */}
      <Section
        title="Orphan excusals"
        count={issues.orphanExcusals.length}
        icon={UserX}
        action={
          issues.orphanExcusals.length > 0 ? (
            <button
              onClick={deleteOrphanExcusals}
              disabled={busy === "orphan_excusals"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {busy === "orphan_excusals" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete all
            </button>
          ) : null
        }
      >
        {issues.orphanExcusals.length > 0 ? (
          <p className="text-xs text-slate-500">
            Excusals pointing at deleted/inactive employees:{" "}
            {issues.orphanExcusals.length}
          </p>
        ) : (
          <p className="text-sm text-slate-400">No issues.</p>
        )}
      </Section>
    </div>
  );
}
