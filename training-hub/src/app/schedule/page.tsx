"use client";

import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";

interface ScheduleData {
  sessions: Array<{
    rowIndex: number;
    training: string;
    date: string;
    time: string;
    location: string;
    enrolled: string[];
    capacity: number;
    status: "scheduled" | "completed";
  }>;
}

export default function SchedulePage() {
  const { data, loading, error } = useFetch<ScheduleData>("/api/schedule");
  const [view, setView] = useState<"list" | "calendar">("list");

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { sessions } = data;
  const upcoming = sessions.filter((s) => s.status === "scheduled").sort((a, b) => a.date.localeCompare(b.date));
  const past = sessions.filter((s) => s.status === "completed").sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Class Scheduler</h1>
          <p className="text-slate-500 mt-1">
            {upcoming.length} upcoming, {past.length} completed — from Scheduled sheet
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setView("list")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === "list" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
              List
            </button>
            <button onClick={() => setView("calendar")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === "calendar" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
              Calendar
            </button>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Upcoming Sessions ({upcoming.length})</h2>
            </div>
            {upcoming.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-500">No upcoming sessions.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3">Training</th>
                      <th className="px-6 py-3">Date & Time</th>
                      <th className="px-6 py-3">Location</th>
                      <th className="px-6 py-3">Enrollment</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {upcoming.map((session) => {
                      const enrolledCount = session.enrolled.length;
                      const spotsLeft = session.capacity - enrolledCount;
                      const isFull = spotsLeft <= 0;
                      return (
                        <tr key={session.rowIndex} className="hover:bg-slate-50">
                          <td className="px-6 py-4 font-medium text-slate-900">{session.training}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            <div>{session.date}</div>
                            {session.time && <div className="text-xs text-slate-400">{session.time}</div>}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{session.location || "—"}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full max-w-[80px]">
                                <div
                                  className={`h-2 rounded-full ${isFull ? "bg-red-500" : spotsLeft <= 2 ? "bg-yellow-500" : "bg-green-500"}`}
                                  style={{ width: `${Math.min(100, (enrolledCount / session.capacity) * 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-600 whitespace-nowrap">{enrolledCount}/{session.capacity}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4"><StatusBadge status={session.status} type="session" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {past.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">Past Sessions ({past.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3">Training</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Attendance</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {past.map((session) => (
                      <tr key={session.rowIndex} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{session.training}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{session.date}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{session.enrolled.length}/{session.capacity}</td>
                        <td className="px-6 py-4"><StatusBadge status={session.status} type="session" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
          Calendar view coming soon. Use the list view to see all sessions.
        </div>
      )}
    </div>
  );
}
