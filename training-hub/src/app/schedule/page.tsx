"use client";

import { useState } from "react";
import { Plus, Calendar, ChevronLeft, ChevronRight, Users as UsersIcon } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";

// Demo data — will be replaced with Supabase queries
const demoSessions = [
  { id: "1", training: "CPR/FA", date: "2026-04-03", time: "9:00 AM", location: "Training Room A", instructor: "J. Smith", enrolled: 8, capacity: 10, status: "scheduled" as const },
  { id: "2", training: "Ukeru", date: "2026-04-13", time: "10:00 AM", location: "Main Hall", instructor: "K. Jones", enrolled: 10, capacity: 12, status: "scheduled" as const },
  { id: "3", training: "Mealtime", date: "2026-04-15", time: "1:00 PM", location: "Training Room B", instructor: "L. Davis", enrolled: 12, capacity: 15, status: "scheduled" as const },
  { id: "4", training: "Med Recert", date: "2026-04-17", time: "8:00 AM", location: "Clinic Room", instructor: "Dr. Wilson", enrolled: 3, capacity: 4, status: "scheduled" as const },
  { id: "5", training: "CPR/FA", date: "2026-04-10", time: "9:00 AM", location: "Training Room A", instructor: "J. Smith", enrolled: 10, capacity: 10, status: "scheduled" as const },
  { id: "6", training: "Safety Care", date: "2026-04-20", time: "2:00 PM", location: "Main Hall", instructor: "M. Brown", enrolled: 5, capacity: 15, status: "scheduled" as const },
  { id: "7", training: "Meaningful Day", date: "2026-04-22", time: "10:00 AM", location: "Training Room A", instructor: "K. Mahoney", enrolled: 7, capacity: 15, status: "scheduled" as const },
  { id: "8", training: "CPR/FA", date: "2026-03-27", time: "9:00 AM", location: "Training Room A", instructor: "J. Smith", enrolled: 9, capacity: 10, status: "completed" as const },
];

export default function SchedulePage() {
  const [view, setView] = useState<"list" | "calendar">("list");

  const upcoming = demoSessions
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = demoSessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Class Scheduler</h1>
          <p className="text-slate-500 mt-1">
            Schedule and manage training sessions
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                view === "list" ? "bg-white shadow text-slate-900" : "text-slate-600"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                view === "calendar" ? "bg-white shadow text-slate-900" : "text-slate-600"
              }`}
            >
              Calendar
            </button>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="h-4 w-4" />
            New Session
          </button>
        </div>
      </div>

      {view === "list" ? (
        <div className="space-y-6">
          {/* Upcoming sessions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                Upcoming Sessions ({upcoming.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Training</th>
                    <th className="px-6 py-3">Date & Time</th>
                    <th className="px-6 py-3">Location</th>
                    <th className="px-6 py-3">Instructor</th>
                    <th className="px-6 py-3">Enrollment</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {upcoming.map((session) => {
                    const spotsLeft = session.capacity - session.enrolled;
                    const isFull = spotsLeft <= 0;

                    return (
                      <tr key={session.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <span className="font-medium text-slate-900">
                            {session.training}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          <div>{session.date}</div>
                          <div className="text-xs text-slate-400">{session.time}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {session.location}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {session.instructor}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full max-w-[80px]">
                              <div
                                className={`h-2 rounded-full ${
                                  isFull
                                    ? "bg-red-500"
                                    : spotsLeft <= 2
                                      ? "bg-yellow-500"
                                      : "bg-green-500"
                                }`}
                                style={{
                                  width: `${Math.min(100, (session.enrolled / session.capacity) * 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-slate-600 whitespace-nowrap">
                              {session.enrolled}/{session.capacity}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={session.status} type="session" />
                        </td>
                        <td className="px-6 py-4">
                          <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                            Manage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Past sessions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                Past Sessions ({past.length})
              </h2>
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
                    <tr key={session.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {session.training}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {session.date}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {session.enrolled}/{session.capacity}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={session.status} type="session" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Calendar view placeholder */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center justify-between mb-6">
            <button className="p-2 hover:bg-slate-100 rounded-lg">
              <ChevronLeft className="h-5 w-5 text-slate-600" />
            </button>
            <h2 className="text-lg font-semibold text-slate-900">April 2026</h2>
            <button className="p-2 hover:bg-slate-100 rounded-lg">
              <ChevronRight className="h-5 w-5 text-slate-600" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="bg-slate-50 px-2 py-2 text-center text-xs font-medium text-slate-500">
                {day}
              </div>
            ))}
            {Array.from({ length: 35 }, (_, i) => {
              const dayNum = i - 2; // April 2026 starts on Wednesday (offset 3, 0-indexed)
              const isCurrentMonth = dayNum >= 1 && dayNum <= 30;
              const daySessions = isCurrentMonth
                ? demoSessions.filter(
                    (s) => parseInt(s.date.split("-")[2]) === dayNum
                  )
                : [];

              return (
                <div
                  key={i}
                  className={`bg-white p-2 min-h-[80px] ${
                    !isCurrentMonth ? "opacity-30" : ""
                  }`}
                >
                  {isCurrentMonth && (
                    <>
                      <span className="text-xs text-slate-600">{dayNum}</span>
                      {daySessions.map((s) => (
                        <div
                          key={s.id}
                          className="mt-1 px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs rounded truncate"
                        >
                          {s.training}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
