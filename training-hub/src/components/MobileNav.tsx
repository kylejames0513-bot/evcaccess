"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  CalendarPlus,
  Users,
  GraduationCap,
  Settings,
  ClipboardCheck,
  UserCheck,
  Bell,
  FileText,
  HeartPulse,
  UserPlus,
  RefreshCw,
  BarChart3,
  Zap,
  Upload,
  ListChecks,
  PenLine,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/compliance", label: "Compliance", icon: ClipboardCheck },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/schedule", label: "Schedule", icon: CalendarPlus },
  { href: "/attendance", label: "Attendance", icon: UserCheck },
  { href: "/records", label: "Records", icon: FileText },
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/review", label: "Review Queue", icon: ListChecks },
  { href: "/new-hires", label: "New Hires", icon: UserPlus },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/trainings", label: "Training Types", icon: GraduationCap },
  { href: "/data-health", label: "Data Quality", icon: HeartPulse },
  { href: "/sync", label: "Sync", icon: RefreshCw },
  { href: "/signin", label: "Public Sign In", icon: PenLine },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface MobileNavProps {
  onQuickRecord?: () => void;
}

export default function MobileNav({ onQuickRecord }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
            <GraduationCap className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-sm text-slate-900">EVC Training</span>
        </div>
        <div className="flex items-center gap-2">
          {onQuickRecord && (
            <button
              onClick={() => { onQuickRecord(); setOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-semibold text-white transition-colors"
            >
              <Zap className="h-3.5 w-3.5" /> Record
            </button>
          )}
          <button onClick={() => setOpen(!open)} aria-label="Toggle menu" className="p-1 text-slate-500">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="bg-white border-b border-slate-200 px-3 pb-3 pt-1 space-y-0.5 shadow-lg">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
