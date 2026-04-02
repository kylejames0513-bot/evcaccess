"use client";

import { useState } from "react";
import { Archive, Search, Calendar, Users as UsersIcon, CheckCircle } from "lucide-react";
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

export default function ArchivePage() {
  const { data, loading, error } = useFetch<ScheduleData>("/api/schedule");
  const [search, setSearch] = useState("");
  const [trainingFilter, setTrainingFilter] = useState<string>("all");

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const past = data.sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => b.date.localeCompare(a.date));

  const trainings = [...new Set(past.map((s) => s.training))].sort();

  const filtered = past.filter((s) => {
    const matchesTraining = trainingFilter === "all" || s.training === trainingFilter;
    const matchesSearch = !search ||
      s.training.toLowerCase().includes(search.toLowerCase()) ||
      s.enrolled.some((n) => n.toLowerCase().includes(search.toLowerCase()));
    return matchesTraining && matchesSearch;
  });

  // Group by month
  const grouped: Record<string, typeof filtered> = {};
  for (const session of filtered) {
    const d = new Date(session.date);
    const key = isNaN(d.getTime())
      ? "Other"
      : d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(session);
  }

  const totalAttendees = past.reduce((sum, s) => sum + s.enrolled.length, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Archive</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {past.length} completed session{past.length !== 1 ? "s" : ""} &middot; {totalAttendees} total attendees
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-slate-200 px-4 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search training or attendee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
        <select value={trainingFilter} onChange={(e) => setTrainingFilter(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All trainings</option>
          {trainings.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} session{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Sessions grouped by month */}
      {past.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Archive className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-slate-900">No archived sessions yet</h3>
          <p className="text-xs text-slate-400 mt-1">Completed training sessions will appear here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <p className="text-sm text-slate-400">No sessions match your search.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([month, sessions]) => (
          <div key={month}>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 px-1">{month}</h2>
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.rowIndex}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden card-hover"
                >
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-50">
                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">{session.training}</h3>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {session.date}{session.time ? ` at ${session.time}` : ""}
                            </span>
                            {session.location && <span>{session.location}</span>}
                            <span className="flex items-center gap-1">
                              <UsersIcon className="h-3 w-3" />
                              {session.enrolled.length} attendee{session.enrolled.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                      <StatusBadge status="completed" type="session" />
                    </div>

                    {/* Attendee list */}
                    {session.enrolled.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {session.enrolled.map((name) => (
                          <span
                            key={name}
                            className="px-2 py-0.5 bg-slate-50 text-slate-600 text-xs rounded-md border border-slate-100"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
