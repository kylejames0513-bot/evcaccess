import type { ComplianceStatus, SessionStatus, AttendanceStatus } from "@/types/database";

const complianceColors: Record<ComplianceStatus, string> = {
  current: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  expiring_soon: "bg-amber-100 text-amber-700 ring-amber-600/20",
  expired: "bg-red-100 text-red-700 ring-red-600/20",
  needed: "bg-orange-100 text-orange-700 ring-orange-600/20",
  excused: "bg-slate-100 text-slate-500 ring-slate-500/10",
};

const sessionColors: Record<SessionStatus, string> = {
  scheduled: "bg-blue-100 text-blue-700 ring-blue-600/20",
  in_progress: "bg-violet-100 text-violet-700 ring-violet-600/20",
  completed: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-500/10",
};

const attendanceColors: Record<AttendanceStatus, string> = {
  enrolled: "bg-blue-100 text-blue-700 ring-blue-600/20",
  attended: "bg-violet-100 text-violet-700 ring-violet-600/20",
  passed: "bg-emerald-100 text-emerald-700 ring-emerald-600/20",
  failed: "bg-red-100 text-red-700 ring-red-600/20",
  no_show: "bg-orange-100 text-orange-700 ring-orange-600/20",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-500/10",
};

export default function StatusBadge({ status, type = "compliance" }: { status: string; type?: "compliance" | "session" | "attendance" }) {
  const colors =
    type === "session"
      ? sessionColors
      : type === "attendance"
        ? attendanceColors
        : complianceColors;

  const colorClass = (colors as Record<string, string>)[status] || "bg-slate-100 text-slate-500";
  const label = status.replace(/_/g, " ");

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${colorClass}`}>
      {label}
    </span>
  );
}
