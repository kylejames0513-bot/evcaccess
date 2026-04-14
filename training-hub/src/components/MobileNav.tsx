"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  CalendarPlus,
  ClipboardCheck,
  UserCheck,
  UserPlus,
  UserMinus,
  RefreshCw,
  PenLine,
  ShieldCheck,
  Users,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Hub Overview", icon: LayoutDashboard },
  { href: "/compliance", label: "Compliance", icon: ClipboardCheck },
  { href: "/schedule", label: "Schedule", icon: CalendarPlus },
  { href: "/attendance", label: "Attendance", icon: UserCheck },
  { href: "/new-hires", label: "New Hires", icon: UserPlus },
  { href: "/reports", label: "Separation Summary", icon: UserMinus },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/sync", label: "Google Sheets Sync", icon: RefreshCw },
  { href: "/data-health", label: "Data Quality", icon: ShieldCheck },
  { href: "/signin", label: "Public Sign In", icon: PenLine },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
            HR
          </div>
          <span className="font-bold text-sm text-slate-900">EVC Training</span>
        </div>
        <div className="flex items-center gap-2">
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
