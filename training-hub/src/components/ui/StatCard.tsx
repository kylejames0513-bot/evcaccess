import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: "blue" | "green" | "yellow" | "red" | "purple";
}

const styles = {
  blue:   { bg: "bg-blue-50",    icon: "text-blue-600",    border: "border-blue-100" },
  green:  { bg: "bg-emerald-50", icon: "text-emerald-600", border: "border-emerald-100" },
  yellow: { bg: "bg-amber-50",   icon: "text-amber-600",   border: "border-amber-100" },
  red:    { bg: "bg-red-50",     icon: "text-red-600",     border: "border-red-100" },
  purple: { bg: "bg-violet-50",  icon: "text-violet-600",  border: "border-violet-100" },
};

export default function StatCard({ title, value, subtitle, icon: Icon, color = "blue" }: StatCardProps) {
  const s = styles[color];
  return (
    <div className={`bg-white rounded-xl border ${s.border} p-5 card-hover`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1.5">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${s.bg}`}>
          <Icon className={`h-5 w-5 ${s.icon}`} />
        </div>
      </div>
    </div>
  );
}
