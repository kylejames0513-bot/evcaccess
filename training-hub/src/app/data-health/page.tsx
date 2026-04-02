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
} from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface GarbledDate {
  row: number;
  name: string;
  column: string;
  value: string;
}

interface DuplicateEmployee {
  name: string;
  rows: number[];
}

interface CprFaMismatch {
  row: number;
  name: string;
  cprDate: string;
  faDate: string;
}

interface DataHealthResponse {
  issues: {
    garbledDates: GarbledDate[];
    duplicateEmployees: DuplicateEmployee[];
    cprFaMismatch: CprFaMismatch[];
    emptyRows: number[];
    missingNames: number[];
  };
  summary: {
    total: number;
    garbled: number;
    duplicates: number;
    mismatches: number;
    empty: number;
    missing: number;
  };
}

function Section({
  title,
  count,
  icon: Icon,
  children,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(count > 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors rounded-xl"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <Icon className="h-4 w-4 text-slate-500 shrink-0" />
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span
          className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
            count > 0
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {count > 0 ? `${count} issue${count !== 1 ? "s" : ""}` : "Clean"}
        </span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

export default function DataHealthPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { data, loading, error } = useFetch<DataHealthResponse>(
    `/api/data-health?r=${refreshKey}`
  );

  if (loading) return <Loading message="Scanning training data..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { issues, summary } = data;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Health</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {summary.total === 0
              ? "No issues found in the Training sheet"
              : `${summary.total} issue${summary.total !== 1 ? "s" : ""} found across ${Object.values(summary).filter((v, i) => i > 0 && v > 0).length} categories`}
          </p>
        </div>
        <button
          onClick={async () => {
            setRefreshing(true);
            try {
              await fetch("/api/refresh", { method: "POST" });
              setRefreshKey((k) => k + 1);
            } catch {}
            setRefreshing(false);
          }}
          disabled={refreshing}
          className="ml-auto px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors text-sm font-medium flex items-center gap-1.5"
          title="Refresh scan"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh Scan
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          title="Garbled Dates"
          value={summary.garbled}
          icon={summary.garbled > 0 ? CalendarX : CheckCircle2}
          color={summary.garbled > 0 ? "red" : "green"}
        />
        <StatCard
          title="Duplicates"
          value={summary.duplicates}
          icon={summary.duplicates > 0 ? Copy : CheckCircle2}
          color={summary.duplicates > 0 ? "red" : "green"}
        />
        <StatCard
          title="CPR/FA Mismatch"
          value={summary.mismatches}
          icon={summary.mismatches > 0 ? AlertTriangle : CheckCircle2}
          color={summary.mismatches > 0 ? "yellow" : "green"}
        />
        <StatCard
          title="Empty Rows"
          value={summary.empty}
          icon={summary.empty > 0 ? FileWarning : CheckCircle2}
          color={summary.empty > 0 ? "yellow" : "green"}
        />
        <StatCard
          title="Missing Names"
          value={summary.missing}
          icon={summary.missing > 0 ? UserX : CheckCircle2}
          color={summary.missing > 0 ? "yellow" : "green"}
        />
      </div>

      {/* Issue sections */}
      <div className="space-y-3">
        {/* Garbled Dates */}
        <Section
          title="Garbled Dates"
          count={issues.garbledDates.length}
          icon={CalendarX}
        >
          {issues.garbledDates.length === 0 ? (
            <p className="text-sm text-slate-500">
              All date values are valid or recognized excusal codes.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="pb-2 pr-4">Row</th>
                    <th className="pb-2 pr-4">Employee</th>
                    <th className="pb-2 pr-4">Column</th>
                    <th className="pb-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.garbledDates.map((d, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="py-2 pr-4 text-slate-500 font-mono text-xs">
                        {d.row}
                      </td>
                      <td className="py-2 pr-4 text-slate-800">{d.name}</td>
                      <td className="py-2 pr-4 text-slate-600 font-mono text-xs">
                        {d.column}
                      </td>
                      <td className="py-2">
                        <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-mono">
                          {d.value}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Duplicate Employees */}
        <Section
          title="Duplicate Employees"
          count={issues.duplicateEmployees.length}
          icon={Users}
        >
          {issues.duplicateEmployees.length === 0 ? (
            <p className="text-sm text-slate-500">
              No duplicate active employees found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="pb-2 pr-4">Employee</th>
                    <th className="pb-2">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.duplicateEmployees.map((d, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="py-2 pr-4 text-slate-800">{d.name}</td>
                      <td className="py-2">
                        <span className="text-slate-600 font-mono text-xs">
                          {d.rows.join(", ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* CPR/FA Mismatch */}
        <Section
          title="CPR/FA Date Mismatch"
          count={issues.cprFaMismatch.length}
          icon={AlertTriangle}
        >
          {issues.cprFaMismatch.length === 0 ? (
            <p className="text-sm text-slate-500">
              All CPR and First Aid dates match.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="pb-2 pr-4">Row</th>
                    <th className="pb-2 pr-4">Employee</th>
                    <th className="pb-2 pr-4">CPR Date</th>
                    <th className="pb-2">First Aid Date</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.cprFaMismatch.map((d, i) => (
                    <tr
                      key={i}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="py-2 pr-4 text-slate-500 font-mono text-xs">
                        {d.row}
                      </td>
                      <td className="py-2 pr-4 text-slate-800">{d.name}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-amber-700">
                        {d.cprDate}
                      </td>
                      <td className="py-2 font-mono text-xs text-amber-700">
                        {d.faDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Empty Rows */}
        <Section
          title="Empty Rows (no last name but has data)"
          count={issues.emptyRows.length}
          icon={FileWarning}
        >
          {issues.emptyRows.length === 0 ? (
            <p className="text-sm text-slate-500">No empty rows found.</p>
          ) : (
            <p className="text-sm text-slate-700">
              <span className="text-slate-500">Rows: </span>
              <span className="font-mono text-xs">
                {issues.emptyRows.join(", ")}
              </span>
            </p>
          )}
        </Section>

        {/* Missing Names */}
        <Section
          title="Missing First Names"
          count={issues.missingNames.length}
          icon={UserX}
        >
          {issues.missingNames.length === 0 ? (
            <p className="text-sm text-slate-500">
              All employees have first and last names.
            </p>
          ) : (
            <p className="text-sm text-slate-700">
              <span className="text-slate-500">Rows: </span>
              <span className="font-mono text-xs">
                {issues.missingNames.join(", ")}
              </span>
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
