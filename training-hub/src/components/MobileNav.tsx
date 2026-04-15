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
  Upload,
  ListChecks,
  ClipboardList,
  Settings,
  Briefcase,
  BarChart3,
  Inbox,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const mobileNavSections: { title: string; items: NavItem[] }[] = [
  {
    title: "Core",
    items: [
      { href: "/", label: "Hub Overview", icon: LayoutDashboard },
      { href: "/compliance", label: "Compliance", icon: ClipboardCheck },
      { href: "/review", label: "Review Queue", icon: ListChecks },
      { href: "/employees", label: "Employees", icon: Users },
    ],
  },
  {
    title: "Daily Operations",
    items: [
      { href: "/operations", label: "Today / Operations", icon: Briefcase },
      { href: "/roster-queue", label: "Roster queue", icon: Inbox },
      { href: "/attendance", label: "Attendance", icon: UserCheck },
      { href: "/imports", label: "Imports (Merged Sheet)", icon: Upload },
      { href: "/new-hires", label: "New Hire Training", icon: UserPlus },
      { href: "/reports", label: "Separation Summary", icon: BarChart3 },
      { href: "/schedule", label: "Schedule", icon: CalendarPlus },
    ],
  },
  {
    title: "Excel Workbooks",
    items: [
      { href: "/tracker/new-hires", label: "New Hire Workbook (Excel)", icon: ClipboardList },
      { href: "/tracker/separations", label: "Separation Workbook (Excel)", icon: UserMinus },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/sync", label: "Google Sheets Sync", icon: RefreshCw },
      { href: "/data-health", label: "Data Quality", icon: ShieldCheck },
      { href: "/signin", label: "Public Sign-In", icon: PenLine },
    ],
  },
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
        <nav className="bg-white border-b border-slate-200 px-3 pb-3 pt-1 space-y-4 shadow-lg max-h-[70vh] overflow-y-auto">
          {mobileNavSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-500">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <Icon className={`h-[18px] w-[18px] ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
