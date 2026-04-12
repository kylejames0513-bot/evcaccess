"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarPlus,
  Users,
  GraduationCap,
  Settings,
  ClipboardCheck,
  ShieldCheck,
  UserCheck,
  Bell,
  FileText,
  HeartPulse,
  UserPlus,
  BarChart3,
  RefreshCw,
  Zap,
  Upload,
  ListChecks,
  PenLine,
  LogOut,
} from "lucide-react";

const mainNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/compliance", label: "Compliance", icon: ClipboardCheck },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/schedule", label: "Schedule", icon: CalendarPlus },
  { href: "/attendance", label: "Attendance", icon: UserCheck },
  { href: "/records", label: "Records", icon: FileText },
];

const workflowNav = [
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/review", label: "Review Queue", icon: ListChecks },
  { href: "/new-hires", label: "New Hires", icon: UserPlus },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

const systemNav = [
  { href: "/trainings", label: "Training Types", icon: GraduationCap },
  { href: "/required-trainings", label: "Required Trainings", icon: ShieldCheck },
  { href: "/data-health", label: "Data Quality", icon: HeartPulse },
  { href: "/sync", label: "Sync", icon: RefreshCw },
  { href: "/signin", label: "Public Sign In", icon: PenLine },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  onQuickRecord?: () => void;
}

export default function Sidebar({ onQuickRecord }: SidebarProps) {
  const pathname = usePathname();

  function navLink(item: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
    const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
          isActive
            ? "bg-blue-50 text-blue-700 font-semibold"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
        {item.label}
      </Link>
    );
  }

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[240px] bg-white border-r border-slate-200/80 h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <GraduationCap className="h-[18px] w-[18px] text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-slate-900 leading-tight">EVC Training</h1>
            <p className="text-[11px] text-slate-400 font-medium">Emory Valley Center</p>
          </div>
        </div>
      </div>

      {/* Quick Record button */}
      <div className="px-4 py-3">
        <button
          onClick={onQuickRecord}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm"
        >
          <Zap className="h-4 w-4 shrink-0" />
          Record Training
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 overflow-y-auto space-y-5 pb-4">
        <div>
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Core
          </p>
          <div className="space-y-0.5">
            {mainNav.map(navLink)}
          </div>
        </div>

        <div>
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Workflow
          </p>
          <div className="space-y-0.5">
            {workflowNav.map(navLink)}
          </div>
        </div>

        <div>
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            System
          </p>
          <div className="space-y-0.5">
            {systemNav.map(navLink)}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-700">Kyle Mahoney</p>
          <p className="text-[11px] text-slate-400">HR Admin</p>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/auth", { method: "DELETE" });
            window.location.href = "/login";
          }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
