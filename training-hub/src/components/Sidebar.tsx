"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  CalendarPlus,
  Users,
  QrCode,
  Bell,
  Settings,
  GraduationCap,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trainings", label: "Training Catalog", icon: BookOpen },
  { href: "/schedule", label: "Class Scheduler", icon: CalendarPlus },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/compliance", label: "Compliance", icon: GraduationCap },
  { href: "/attendance", label: "QR Attendance", icon: QrCode },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-slate-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <GraduationCap className="h-8 w-8 text-blue-400" />
        <div>
          <h1 className="text-lg font-bold leading-tight">EVC Training</h1>
          <p className="text-xs text-slate-400">Emory Valley Center</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info footer */}
      <div className="border-t border-slate-700 px-4 py-3">
        <p className="text-sm font-medium text-slate-300">HR Admin</p>
        <p className="text-xs text-slate-500">Kyle Mahoney</p>
      </div>
    </aside>
  );
}
