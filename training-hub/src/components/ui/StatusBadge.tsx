import type { ComplianceStatus, SessionStatus, AttendanceStatus } from "@/types/database";

const complianceColors: Record<ComplianceStatus, string> = {
  current: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expiring_soon: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  needed: "bg-orange-50 text-orange-700 border-orange-200",
  excused: "bg-slate-50 text-slate-500 border-slate-200",
};

const sessionColors: Record<SessionStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-violet-50 text-violet-700 border-violet-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

const attendanceColors: Record<AttendanceStatus, string> = {
  enrolled: "bg-blue-50 text-blue-700 border-blue-200",
  attended: "bg-violet-50 text-violet-700 border-violet-200",
  passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  no_show: "bg-orange-50 text-orange-700 border-orange-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

export default function StatusBadge({ status, type = "compliance" }: { status: string; type?: "compliance" | "session" | "attendance" }) {
  const colors =
    type === "session"
      ? sessionColors
      : type === "attendance"
        ? attendanceColors
        : complianceColors;

  const colorClass = (colors as Record<string, string>)[status] || "bg-slate-50 text-slate-500 border-slate-200";
  const label = status.replace(/_/g, " ");

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide border ${colorClass}`}>
      {label}
    </span>
  );
}
