"use client";

import {
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  CalendarDays,
  TrendingUp,
} from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { Loading, ErrorState } from "@/components/ui/DataState";
import { useFetch } from "@/lib/use-fetch";
import type { ComplianceStatus } from "@/types/database";

interface DashboardData {
  stats: {
    totalEmployees: number;
    fullyCompliant: number;
    expiringSoon: number;
    expired: number;
    needed: number;
    upcomingSessions: number;
  };
  urgentIssues: Array<{
    employee: string;
    training: string;
    status: ComplianceStatus;
    date: string | null;
    expirationDate: string | null;
  }>;
  upcoming: Array<{
    training: string;
    date: string;
    time: string;
    enrolled: string[];
    capacity: number;
  }>;
}

export default function DashboardPage() {
  const { data, loading, error } = useFetch<DashboardData>("/api/dashboard");

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { stats, urgentIssues, upcoming } = data;
  const complianceRate = stats.totalEmployees > 0
    ? Math.round((stats.fullyCompliant / stats.totalEmployees) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Training compliance overview — live from Google Sheets</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Total Employees" value={stats.totalEmployees} icon={Users} color="blue" />
        <StatCard title="Fully Compliant" value={stats.fullyCompliant} subtitle={`${complianceRate}% rate`} icon={CheckCircle} color="green" />
        <StatCard title="Expiring Soon" value={stats.expiringSoon} subtitle="Within 60 days" icon={Clock} color="yellow" />
        <StatCard title="Expired" value={stats.expired} subtitle="Action needed" icon={AlertTriangle} color="red" />
        <StatCard title="Upcoming Classes" value={stats.upcomingSessions} subtitle="Scheduled" icon={CalendarDays} color="purple" />
        <StatCard title="Needs Training" value={stats.needed} subtitle="Never completed" icon={TrendingUp} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring trainings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Expiring & Expired Trainings</h2>
            <p className="text-sm text-slate-500">Employees needing immediate attention</p>
          </div>
          <div className="divide-y divide-slate-100">
            {urgentIssues.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-500 text-sm">
                No urgent compliance issues. All clear!
              </div>
            ) : (
              urgentIssues.map((item, i) => (
                <div key={i} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.employee}</p>
                    <p className="text-xs text-slate-500">{item.training}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">
                      {item.expirationDate || item.date || "Never"}
                    </span>
                    <StatusBadge status={item.status} />
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="px-6 py-3 border-t border-slate-100">
            <a href="/compliance" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View all compliance issues →
            </a>
          </div>
        </div>

        {/* Upcoming sessions */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Upcoming Classes</h2>
            <p className="text-sm text-slate-500">Next scheduled training sessions</p>
          </div>
          <div className="divide-y divide-slate-100">
            {upcoming.length === 0 ? (
              <div className="px-6 py-8 text-center text-slate-500 text-sm">
                No upcoming sessions scheduled.
              </div>
            ) : (
              upcoming.map((session, i) => {
                const enrolledCount = session.enrolled.length;
                const spotsLeft = session.capacity - enrolledCount;
                const isFull = spotsLeft <= 0;

                return (
                  <div key={i} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{session.training}</p>
                      <p className="text-xs text-slate-500">{session.date}{session.time ? ` at ${session.time}` : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-900">{enrolledCount}/{session.capacity}</p>
                      <p className={`text-xs ${isFull ? "text-red-600 font-medium" : spotsLeft <= 2 ? "text-yellow-600" : "text-slate-500"}`}>
                        {isFull ? "FULL" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="px-6 py-3 border-t border-slate-100">
            <a href="/schedule" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Manage schedule →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
