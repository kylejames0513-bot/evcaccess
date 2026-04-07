"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarPlus,
  Users,
  GraduationCap,
  Archive,
  Settings,
  ClipboardCheck,
  UserCheck,
  Bell,
  FileText,
  HeartPulse,
  GitCompare,
  UserPlus,
  FileUp,
  BarChart3,
  Layers,
  Zap,
} from "lucide-react";

const mainNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/schedule", label: "Schedule", icon: CalendarPlus },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/compliance", label: "Compliance", icon: ClipboardCheck },
  { href: "/attendance", label: "Attendance", icon: UserCheck },
  { href: "/records", label: "Records", icon: FileText },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/new-hires", label: "New Hires", icon: UserPlus },
];

const secondaryNav = [
  { href: "/trainings", label: "Training Types", icon: GraduationCap },
  { href: "/data-health", label: "Data Health", icon: HeartPulse },
  { href: "/master-sync", label: "Master Sync", icon: Layers },
  { href: "/paylocity-audit", label: "Paylocity Audit", icon: GitCompare },
  { href: "/phs-import", label: "PHS Import", icon: FileUp },
  { href: "/archive", label: "Archive", icon: Archive },
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
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          isActive
            ? "bg-white/15 text-white shadow-sm"
            : "text-blue-100 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        {item.label}
      </Link>
    );
  }

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-60 bg-gradient-to-b from-[#1e3a5f] to-[#0f172a]">
      {/* Logo */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">EVC Training</h1>
            <p className="text-[11px] text-blue-200/70">Emory Valley Center</p>
          </div>
        </div>
      </div>

      {/* Quick Record button */}
      <div className="px-3 mb-3">
        <button
          onClick={onQuickRecord}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors shadow-lg shadow-emerald-900/30"
        >
          <Zap className="h-4 w-4 shrink-0" />
          Record Training
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 space-y-6 overflow-y-auto">
        <div>
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-blue-300/50">
            Main
          </p>
          <div className="space-y-0.5">
            {mainNav.map(navLink)}
          </div>
        </div>

        <div>
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-blue-300/50">
            More
          </p>
          <div className="space-y-0.5">
            {secondaryNav.map(navLink)}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-blue-200/80">HR Admin</p>
          <p className="text-[11px] text-blue-300/50">Kyle Mahoney</p>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/auth", { method: "DELETE" });
            window.location.href = "/login";
          }}
          className="text-[11px] text-blue-300/50 hover:text-white transition-colors"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
