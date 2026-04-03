"use client";

import { Printer, ArrowLeft } from "lucide-react";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface ScheduleData {
  sessions: Array<{
    rowIndex: number;
    training: string;
    date: string;
    sortDateMs: number;
    time: string;
    location: string;
    enrolled: string[];
    noShows: string[];
    capacity: number;
    status: "scheduled" | "completed";
  }>;
}

export default function PrintSchedulePage() {
  const { data, loading, error } = useFetch<ScheduleData>("/api/schedule");

  if (loading) return <Loading message="Loading schedule..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const upcoming = data.sessions
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => a.sortDateMs - b.sortDateMs);

  const generatedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          /* Hide sidebar, nav, and any app chrome */
          nav, header, aside, [data-sidebar], [data-nav] {
            display: none !important;
          }
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-hidden {
            display: none !important;
          }
          .print-page {
            max-width: none !important;
            margin: 0 !important;
            padding: 0.5in !important;
            box-shadow: none !important;
          }
          .session-block {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* Controls bar -- hidden when printing */}
      <div className="print-hidden max-w-3xl mx-auto mb-6 flex items-center justify-between px-4">
        <a
          href="/schedule"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Schedule
        </a>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      {/* Printable content */}
      <div className="print-page max-w-3xl mx-auto bg-white px-4">
        {/* Page header */}
        <div className="text-center border-b-2 border-slate-800 pb-4 mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            EVC Training Schedule
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Generated {generatedDate}
          </p>
        </div>

        {upcoming.length === 0 ? (
          <p className="text-center text-slate-500 py-12">
            No upcoming sessions scheduled.
          </p>
        ) : (
          <div className="space-y-10">
            {upcoming.map((session) => (
              <div key={session.rowIndex} className="session-block">
                {/* Session header */}
                <div className="border-b-2 border-slate-300 pb-2 mb-3">
                  <h2 className="text-lg font-bold text-slate-900">
                    {session.training}
                  </h2>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 mt-1">
                    <span>{session.date}{session.time ? ` at ${session.time}` : ""}</span>
                    {session.location && <span>{session.location}</span>}
                    <span className="font-medium">
                      {session.enrolled.length}/{session.capacity} enrolled
                    </span>
                  </div>
                </div>

                {/* Enrolled list */}
                {session.enrolled.length > 0 ? (
                  <ol className="list-decimal list-inside space-y-1 pl-1">
                    {session.enrolled.map((name, i) => (
                      <li key={i} className="text-sm text-slate-800">
                        {name}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    No enrollees yet
                  </p>
                )}

                {/* No-shows section */}
                {session.noShows && session.noShows.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-1">
                      No-Shows
                    </h3>
                    <ol className="list-decimal list-inside space-y-1 pl-1">
                      {session.noShows.map((name, i) => (
                        <li
                          key={i}
                          className="text-sm text-slate-500 line-through"
                        >
                          {name}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-slate-300 text-center text-xs text-slate-400">
          EVC Training Hub &middot; {generatedDate}
        </div>
      </div>
    </>
  );
}
