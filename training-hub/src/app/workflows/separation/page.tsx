"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Inbox,
  RefreshCw,
  ShieldAlert,
  UserMinus,
} from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { ErrorState, Loading } from "@/components/ui/DataState";

type SyncLog = {
  timestamp: string;
  source: string;
  total_rows?: number;
  applied?: number;
  skipped?: number;
  errors?: number;
};

type SeparationWorkflowPayload = {
  kpis: {
    audit_rows: number;
    unresolved_people: number;
    unknown_trainings: number;
    pending_roster_events: number;
    inactive_last_30_days: number;
  };
  sync: {
    last_sync_at: string | null;
    stale: boolean;
    recent: SyncLog[];
  };
  audit_preview: Array<{
    id: string;
    fy_sheet: string;
    row_number: number;
    first_name: string;
    last_name: string;
    date_of_separation: string;
    sync_status: string | null;
    notes: string | null;
  }>;
  action_links: Array<{
    href: string;
    label: string;
    description: string;
    priority: "high" | "medium" | "low";
  }>;
};

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function priorityStyles(priority: "high" | "medium" | "low"): string {
  if (priority === "high") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function SeparationWorkflowPage() {
  const { data, loading, error } = useFetch<SeparationWorkflowPayload>(
    "/api/workflows/separations"
  );

  const primaryActions = useMemo(
    () => (data?.action_links ?? []).filter((action) => action.priority !== "low"),
    [data]
  );
  const secondaryActions = useMemo(
    () => (data?.action_links ?? []).filter((action) => action.priority === "low"),
    [data]
  );

  if (loading) return <Loading message="Loading Separation workflow..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const riskCount =
    data.kpis.unresolved_people +
    data.kpis.unknown_trainings +
    data.kpis.pending_roster_events;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserMinus className="h-6 w-6 text-blue-600" />
            Separation Workflow
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage FY workbook separations from intake through reconciliation in one place.
          </p>
        </div>
        <Link
          href="/tracker/separations"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          Open separation tracker rows
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={FileSpreadsheet}
          label="Workbook audit rows"
          value={String(data.kpis.audit_rows)}
          tone="blue"
        />
        <KpiCard
          icon={ShieldAlert}
          label="Unresolved people"
          value={String(data.kpis.unresolved_people)}
          tone={data.kpis.unresolved_people > 0 ? "red" : "green"}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Unknown trainings"
          value={String(data.kpis.unknown_trainings)}
          tone={data.kpis.unknown_trainings > 0 ? "amber" : "green"}
        />
        <KpiCard
          icon={Inbox}
          label="Pending roster events"
          value={String(data.kpis.pending_roster_events)}
          tone={data.kpis.pending_roster_events > 0 ? "amber" : "green"}
        />
        <KpiCard
          icon={RefreshCw}
          label="Last 30d separations"
          value={String(data.kpis.inactive_last_30_days)}
          tone="slate"
        />
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Current status</h2>
            <p className="text-xs text-slate-500 mt-1">
              Last sync: {formatDateTime(data.sync.last_sync_at)}
            </p>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded border font-semibold ${
              data.sync.stale
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-emerald-300 bg-emerald-50 text-emerald-700"
            }`}
          >
            {data.sync.stale ? "Sync stale" : "Sync healthy"}
          </span>
        </div>

        {riskCount === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            No active exceptions — workflow is clean.
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {riskCount} exception item{riskCount === 1 ? "" : "s"} need attention.
          </div>
        )}

        {primaryActions.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {primaryActions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className={`rounded-lg border px-3 py-2 text-sm hover:shadow-sm transition-shadow ${priorityStyles(
                  action.priority
                )}`}
              >
                <p className="font-semibold">{action.label}</p>
                <p className="text-xs mt-1 opacity-90">{action.description}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Recent workbook rows</h3>
            <Link href="/tracker/separations" className="text-xs text-blue-600 hover:text-blue-800">
              Full table
            </Link>
          </header>
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {data.audit_preview.length === 0 ? (
              <p className="px-4 py-8 text-sm text-slate-500 text-center">No separation rows synced yet.</p>
            ) : (
              data.audit_preview.map((row) => (
                <div key={row.id} className="px-4 py-2.5">
                  <p className="text-sm font-medium text-slate-800">
                    {row.last_name}, {row.first_name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {row.fy_sheet} · row {row.row_number} · DOS {row.date_of_separation}
                  </p>
                  {row.sync_status ? (
                    <p className="text-[11px] text-slate-400 mt-1">status: {row.sync_status}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Sync log excerpts</h3>
          </header>
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {data.sync.recent.length === 0 ? (
              <p className="px-4 py-8 text-sm text-slate-500 text-center">No sync log rows yet.</p>
            ) : (
              data.sync.recent.map((row, idx) => (
                <div key={`${row.timestamp}-${idx}`} className="px-4 py-2.5 text-sm">
                  <p className="font-medium text-slate-800">
                    {row.source || "sync"} · {formatDateTime(row.timestamp)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    rows: {row.total_rows ?? 0} · applied: {row.applied ?? 0} · skipped: {row.skipped ?? 0}
                    {" · "}errors: {row.errors ?? 0}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {secondaryActions.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Reference links</h4>
          <div className="flex flex-wrap gap-2">
            {secondaryActions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50"
              >
                {action.label}
                <ExternalLink className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "blue" | "amber" | "red" | "green" | "slate";
}) {
  const palette: Record<typeof tone, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  };
  return (
    <div className={`rounded-xl border px-3 py-3 ${palette[tone]}`}>
      <Icon className="h-4 w-4" />
      <p className="text-lg font-bold mt-1">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{label}</p>
    </div>
  );
}
