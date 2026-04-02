"use client";

import { useState } from "react";
import { Printer, ArrowLeft, Mail } from "lucide-react";
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

  return (
    <div>
      {/* Controls — hidden when printing */}
      <div className="print:hidden max-w-4xl mx-auto mb-6 flex items-center justify-between">
        <a href="/schedule" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Back to Schedule
        </a>
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Printable content */}
      <div className="max-w-4xl mx-auto bg-white print:shadow-none print:max-w-none">
        {/* Header */}
        <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Emory Valley Center</h1>
          <h2 className="text-lg font-semibold text-slate-700 mt-1">Upcoming Training Schedule</h2>
          <p className="text-sm text-slate-500 mt-1">
            Generated {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        {upcoming.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No upcoming sessions scheduled.</p>
        ) : (
          <div className="space-y-8">
            {upcoming.map((session) => (
              <div key={session.rowIndex} className="break-inside-avoid">
                {/* Session header */}
                <div className="bg-slate-100 print:bg-slate-100 rounded-t-lg px-4 py-2 flex items-center justify-between border border-slate-300 border-b-0">
                  <div>
                    <span className="font-bold text-slate-900 text-base">{session.training}</span>
                    <span className="ml-3 text-sm text-slate-600">
                      {session.date}{session.time ? ` at ${session.time}` : ""}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {session.location && <span>{session.location} &middot; </span>}
                    <span className="font-medium">{session.enrolled.length}/{session.capacity} enrolled</span>
                  </div>
                </div>

                {/* Roster table */}
                <table className="w-full border border-slate-300 border-t-0">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-300">
                      <th className="px-4 py-2 w-10">#</th>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2 w-32 text-center">Attended</th>
                      <th className="px-4 py-2 w-32 text-center">Pass/Fail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.enrolled.length > 0 ? (
                      session.enrolled.map((name, i) => (
                        <tr key={i} className="border-b border-slate-200">
                          <td className="px-4 py-2 text-sm text-slate-500">{i + 1}</td>
                          <td className="px-4 py-2 text-sm font-medium text-slate-900">{name}</td>
                          <td className="px-4 py-2 text-center">
                            <div className="w-5 h-5 border-2 border-slate-300 rounded mx-auto" />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <div className="w-5 h-5 border-2 border-slate-300 rounded mx-auto" />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-sm text-slate-400 text-center italic">
                          No enrollees yet
                        </td>
                      </tr>
                    )}
                    {/* Empty rows for walk-ins */}
                    {Array.from({ length: Math.max(0, session.capacity - session.enrolled.length) }, (_, i) => (
                      <tr key={`empty-${i}`} className="border-b border-slate-200">
                        <td className="px-4 py-2 text-sm text-slate-300">{session.enrolled.length + i + 1}</td>
                        <td className="px-4 py-2 text-sm text-slate-300 italic">open</td>
                        <td className="px-4 py-2 text-center">
                          <div className="w-5 h-5 border-2 border-slate-200 rounded mx-auto" />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="w-5 h-5 border-2 border-slate-200 rounded mx-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-300 text-center text-xs text-slate-400 print:mt-4">
          EVC Training Hub &middot; Printed {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
