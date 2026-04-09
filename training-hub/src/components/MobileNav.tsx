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
  Archive,
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
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/schedule", label: "Schedule", icon: CalendarPlus },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/compliance", label: "Compliance", icon: ClipboardCheck },
  { href: "/attendance", label: "Attendance", icon: UserCheck },
  { href: "/records", label: "Records", icon: FileText },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/new-hires", label: "New Hires", icon: UserPlus },
  { href: "/trainings", label: "Training Types", icon: GraduationCap },
  { href: "/data-health", label: "Data Quality", icon: HeartPulse },
  { href: "/sync", label: "Sync", icon: RefreshCw },
  { href: "/archive", label: "Archive", icon: Archive },
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
      <div className="flex items-center justify-between bg-[#1e3a5f] text-white px-4 py-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-blue-200" />
          <span className="font-bold text-sm">EVC Training</span>
        </div>
        <div className="flex items-center gap-2">
          {onQuickRecord && (
            <button
              onClick={() => { onQuickRecord(); setOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 rounded-lg text-xs font-semibold"
            >
              <Zap className="h-3.5 w-3.5" /> Record
            </button>
          )}
          <button onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="bg-[#1e3a5f] text-white px-3 pb-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? "bg-white/15 text-white" : "text-blue-100 hover:bg-white/10"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
