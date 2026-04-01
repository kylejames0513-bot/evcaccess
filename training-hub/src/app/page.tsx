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

// Demo data — will be replaced with Supabase queries
const stats = {
  totalEmployees: 187,
  fullyCompliant: 142,
  expiringSoon: 23,
  expired: 14,
  upcomingSessions: 8,
  completionsThisMonth: 34,
};

const expiringTrainings = [
  { employee: "Johnson, Maria", training: "CPR/FA", expires: "2026-04-15", status: "expiring_soon" as const },
  { employee: "Smith, Terrence", training: "Med Recert", expires: "2026-04-08", status: "expiring_soon" as const },
  { employee: "Williams, Aisha", training: "CPR/FA", expires: "2026-04-22", status: "expiring_soon" as const },
  { employee: "Brown, Marcus", training: "Ukeru", expires: "2026-03-28", status: "expired" as const },
  { employee: "Davis, Patricia", training: "CPR/FA", expires: "2026-04-30", status: "expiring_soon" as const },
];

const upcomingSessions = [
  { training: "CPR/FA", date: "2026-04-03", enrolled: 8, capacity: 10 },
  { training: "Ukeru", date: "2026-04-13", enrolled: 10, capacity: 12 },
  { training: "Mealtime", date: "2026-04-15", enrolled: 12, capacity: 15 },
  { training: "Med Recert", date: "2026-04-17", enrolled: 3, capacity: 4 },
];

export default function DashboardPage() {
  const complianceRate = Math.round(
    (stats.fullyCompliant / stats.totalEmployees) * 100
  );

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Training compliance overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Employees"
          value={stats.totalEmployees}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Fully Compliant"
          value={stats.fullyCompliant}
          subtitle={`${complianceRate}% rate`}
          icon={CheckCircle}
          color="green"
        />
        <StatCard
          title="Expiring Soon"
          value={stats.expiringSoon}
          subtitle="Within 60 days"
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="Expired"
          value={stats.expired}
          subtitle="Action needed"
          icon={AlertTriangle}
          color="red"
        />
        <StatCard
          title="Upcoming Classes"
          value={stats.upcomingSessions}
          subtitle="Next 30 days"
          icon={CalendarDays}
          color="purple"
        />
        <StatCard
          title="Completions"
          value={stats.completionsThisMonth}
          subtitle="This month"
          icon={TrendingUp}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiring trainings */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              Expiring & Expired Trainings
            </h2>
            <p className="text-sm text-slate-500">
              Employees needing immediate attention
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {expiringTrainings.map((item, i) => (
              <div key={i} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {item.employee}
                  </p>
                  <p className="text-xs text-slate-500">{item.training}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{item.expires}</span>
                  <StatusBadge status={item.status} />
                </div>
              </div>
            ))}
          </div>
          <div className="px-6 py-3 border-t border-slate-100">
            <a
              href="/compliance"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View all compliance issues →
            </a>
          </div>
        </div>

        {/* Upcoming sessions */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              Upcoming Classes
            </h2>
            <p className="text-sm text-slate-500">
              Next scheduled training sessions
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {upcomingSessions.map((session, i) => {
              const spotsLeft = session.capacity - session.enrolled;
              const isFull = spotsLeft <= 0;

              return (
                <div key={i} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {session.training}
                    </p>
                    <p className="text-xs text-slate-500">{session.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">
                      {session.enrolled}/{session.capacity}
                    </p>
                    <p
                      className={`text-xs ${
                        isFull
                          ? "text-red-600 font-medium"
                          : spotsLeft <= 2
                            ? "text-yellow-600"
                            : "text-slate-500"
                      }`}
                    >
                      {isFull
                        ? "FULL"
                        : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-6 py-3 border-t border-slate-100">
            <a
              href="/schedule"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Manage schedule →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
