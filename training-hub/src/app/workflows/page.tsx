"use client";

import Link from "next/link";
import { ArrowRight, UserMinus, UserPlus, Workflow } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

type WorkflowsOverview = {
  generated_at: string;
  kpis: {
    open_people: number;
    open_trainings: number;
    pending_roster_events: number;
    preview_imports: number;
    failed_imports: number;
    new_hire_audit_rows: number;
    separation_audit_rows: number;
  };
};

export default function WorkflowHubPage() {
  const { data, loading, error } = useFetch<WorkflowsOverview>("/api/workflows/overview");

  if (loading) return <Loading message="Loading workflow hub..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Workflow className="h-6 w-6 text-blue-600" />
          Workflow Hub
        </h1>
        <p className="text-sm text-slate-500">
          Run New Hire and Separation workflows from one place with queue visibility, intake status, and audit links.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Open People Matches" value={data.kpis.open_people} tone="amber" />
        <SummaryCard label="Open Training Matches" value={data.kpis.open_trainings} tone="amber" />
        <SummaryCard label="Pending Roster Queue" value={data.kpis.pending_roster_events} tone="blue" />
        <SummaryCard label="Preview Imports" value={data.kpis.preview_imports} tone="slate" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <WorkflowCard
          href="/workflows/new-hire"
          title="New Hire Workflow"
          subtitle="Workbook intake, new-hire tracker rows, and exceptions."
          icon={UserPlus}
          stats={[
            { label: "Workbook audit rows", value: data.kpis.new_hire_audit_rows },
            { label: "Review queue items", value: data.kpis.open_people + data.kpis.open_trainings },
          ]}
        />
        <WorkflowCard
          href="/workflows/separation"
          title="Separation Workflow"
          subtitle="Separation sync status, roster queue, and row-level reconciliation."
          icon={UserMinus}
          stats={[
            { label: "Workbook audit rows", value: data.kpis.separation_audit_rows },
            { label: "Failed imports", value: data.kpis.failed_imports },
          ]}
        />
      </section>
    </div>
  );
}

function WorkflowCard({
  href,
  title,
  subtitle,
  icon: Icon,
  stats,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  stats: Array<{ label: string; value: number }>;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
            <p className="text-lg font-semibold text-slate-900">{stat.value}</p>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 text-sm font-medium text-blue-600 inline-flex items-center gap-1">
        Open workflow
        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "blue" | "amber";
}) {
  const tones: Record<typeof tone, string> = {
    slate: "border-slate-200 bg-white text-slate-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
