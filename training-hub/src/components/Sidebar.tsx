"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardCheck,
  UserCheck,
  UserPlus,
  UserMinus,
  RefreshCw,
  CalendarPlus,
  PenLine,
  ShieldCheck,
  Users,
  LogOut,
  Upload,
  ListChecks,
  ClipboardList,
  Settings,
  Briefcase,
  BarChart3,
  Inbox,
} from "lucide-react";

const coreNav = [
  { href: "/", label: "Hub Overview", icon: LayoutDashboard },
  { href: "/compliance", label: "Compliance", icon: ClipboardCheck },
  { href: "/review", label: "Review Queue", icon: ListChecks },
  { href: "/employees", label: "Employees", icon: Users },
];

const operationsNav = [
  { href: "/operations", label: "Today / Operations", icon: Briefcase },
  { href: "/roster-queue", label: "Roster queue", icon: Inbox },
  { href: "/attendance", label: "Attendance", icon: UserCheck },
  { href: "/imports", label: "Imports (Merged Sheet)", icon: Upload },
  { href: "/new-hires", label: "New Hire Training", icon: UserPlus },
  { href: "/reports", label: "Separation Summary", icon: BarChart3 },
  { href: "/schedule", label: "Schedule", icon: CalendarPlus },
];

const trackerNav = [
  { href: "/tracker/new-hires", label: "New Hire Workbook (Excel)", icon: ClipboardList },
  { href: "/tracker/separations", label: "Separation Workbook (Excel)", icon: UserMinus },
];

const systemNav = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/sync", label: "Google Sheets Sync", icon: RefreshCw },
  { href: "/data-health", label: "Data Quality", icon: ShieldCheck },
  { href: "/signin", label: "Public Sign-In", icon: PenLine },
];

function sectionTitleClass() {
  return "px-3 mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500";
}

export default function Sidebar() {
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
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            HR
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-slate-900 leading-tight">EVC Training</h1>
            <p className="text-[11px] text-slate-400 font-medium">Emory Valley Center</p>
          </div>
        </div>
      </div>

      {/* Navigation — Core first, then daily ops, Excel workbooks, system */}
      <nav className="flex-1 px-3 overflow-y-auto space-y-5 pb-4">
        <div>
          <p className={sectionTitleClass()}>Core</p>
          <div className="space-y-0.5">{coreNav.map(navLink)}</div>
        </div>

        <div>
          <p className={sectionTitleClass()}>Daily Operations</p>
          <div className="space-y-0.5">{operationsNav.map(navLink)}</div>
        </div>

        <div>
          <p className={sectionTitleClass()}>Excel Workbooks</p>
          <div className="space-y-0.5">{trackerNav.map(navLink)}</div>
        </div>

        <div>
          <p className={sectionTitleClass()}>System</p>
          <div className="space-y-0.5">{systemNav.map(navLink)}</div>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-700">HR Personnel</p>
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
