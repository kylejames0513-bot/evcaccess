"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, ClipboardList, UserPlus, Workflow } from "lucide-react";
import { useFetch } from "@/lib/use-fetch";
import { ErrorState, Loading } from "@/components/ui/DataState";

interface NewHireWorkflowData {
  generated_at: string;
  totals: {
    tracker_rows: number;
    review_people_open: number;
    review_trainings_open: number;
    pending_roster_events: number;
    active_new_hires_90d: number;
    active_new_hires_without_hire_date: number;
  };
  recent_tracker_rows: Array<{
    id: string;
    sheet: string;
    row_number: number;
    first_name: string;
    last_name: string;
    hire_date: string;
    status: string;
    updated_at: string;
  }>;
  next_actions: Array<{
    href: string;
    label: string;
    priority: "high" | "medium" | "low";
  }>;
}

function tone(priority: "high" | "medium" | "low"): string {
  if (priority === "high") return "bg-red-50 border-red-200 text-red-700";
  if (priority === "medium") return "bg-amber-50 border-amber-200 text-amber-700";
  return "bg-slate-50 border-slate-200 text-slate-700";
}

export default function NewHireWorkflowPage() {
  const { data, loading, error } = useFetch<NewHireWorkflowData>("/api/workflows/new-hires");

  if (loading) return <Loading message="Loading new hire workflow..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const reviewBacklog = data.totals.review_people_open + data.totals.review_trainings_open;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">New Hire Workflow</h1>
              <p className="text-sm text-slate-500 mt-1">
                Intake from Monthly New Hire Tracker, review queue resolution, and tracker row reconciliation.
              </p>
            </div>
          </div>
          <Link
            href="/operations"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Operations hub
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Workbook audit rows" value={data.totals.tracker_rows} />
        <Metric label="Open people matches" value={data.totals.review_people_open} />
        <Metric label="Open training aliases" value={data.totals.review_trainings_open} />
        <Metric label="Queued roster batches" value={data.totals.pending_roster_events} />
        <Metric label="Active new hires (90d)" value={data.totals.active_new_hires_90d} />
      </section>

      {data.totals.active_new_hires_without_hire_date > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            {data.totals.active_new_hires_without_hire_date} active employee rows are missing a hire date. These employees do
            not appear in the 90-day new hire workflow until the hire date is fixed.
          </p>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              Recent tracker rows
            </h2>
            <Link href="/tracker/new-hires" className="text-xs text-blue-600 hover:text-blue-800">
              Open full table
            </Link>
          </header>
          {data.recent_tracker_rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No new hire tracker rows yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.recent_tracker_rows.map((row) => (
                <li key={row.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {row.last_name}, {row.first_name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {row.sheet} #{row.row_number} · hire {row.hire_date}
                    </p>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                    {row.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Workflow className="h-4 w-4 text-violet-600" />
              Next actions
            </h2>
            <Link href="/review" className="text-xs text-blue-600 hover:text-blue-800">
              Open review queue
            </Link>
          </header>
          <ul className="space-y-2 p-4">
            {data.next_actions.map((action) => (
              <li key={`${action.href}-${action.label}`}>
                <Link
                  href={action.href}
                  className={`block rounded-lg border px-3 py-2 text-sm hover:shadow-sm ${tone(action.priority)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{action.label}</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </Link>
              </li>
            ))}
            {reviewBacklog === 0 && data.totals.pending_roster_events === 0 ? (
              <li className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                No critical backlog right now.
              </li>
            ) : null}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
