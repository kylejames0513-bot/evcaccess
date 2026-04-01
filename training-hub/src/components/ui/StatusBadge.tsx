import type { ComplianceStatus, SessionStatus, AttendanceStatus } from "@/types/database";

const complianceColors: Record<ComplianceStatus, string> = {
  current: "bg-green-100 text-green-800",
  expiring_soon: "bg-yellow-100 text-yellow-800",
  expired: "bg-red-100 text-red-800",
  needed: "bg-orange-100 text-orange-800",
  excused: "bg-slate-100 text-slate-600",
};

const sessionColors: Record<SessionStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-600",
};

const attendanceColors: Record<AttendanceStatus, string> = {
  enrolled: "bg-blue-100 text-blue-800",
  attended: "bg-purple-100 text-purple-800",
  passed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  no_show: "bg-orange-100 text-orange-800",
  cancelled: "bg-slate-100 text-slate-600",
};

type BadgeType = ComplianceStatus | SessionStatus | AttendanceStatus;

export default function StatusBadge({ status, type = "compliance" }: { status: string; type?: "compliance" | "session" | "attendance" }) {
  const colors =
    type === "session"
      ? sessionColors
      : type === "attendance"
        ? attendanceColors
        : complianceColors;

  const colorClass = (colors as Record<string, string>)[status] || "bg-slate-100 text-slate-600";
  const label = status.replace(/_/g, " ");

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colorClass}`}>
      {label}
    </span>
  );
}
