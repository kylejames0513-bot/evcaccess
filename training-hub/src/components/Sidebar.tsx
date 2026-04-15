"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  PRIMARY_NAV_GROUPS,
  ADVANCED_NAV_GROUP,
  isNavItemActive,
  type NavGroup,
} from "@/config/navigation";

function sectionTitleClass() {
  return "px-3 mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500";
}

export default function Sidebar() {
  const pathname = usePathname();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  function navLink(item: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
    const isActive = isNavItemActive(pathname, item);
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

  function renderSection(section: NavGroup) {
    return (
      <div key={section.id}>
        <p className={sectionTitleClass()}>{section.title}</p>
        <div className="space-y-0.5">{section.items.map(navLink)}</div>
      </div>
    );
  }

  const hasAdvancedActive = (ADVANCED_NAV_GROUP?.items ?? []).some((item) => isNavItemActive(pathname, item));

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
        {PRIMARY_NAV_GROUPS.map(renderSection)}

        {ADVANCED_NAV_GROUP && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-semibold border transition-colors ${
                hasAdvancedActive
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {ADVANCED_NAV_GROUP.title}
              {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {advancedOpen && (
              <div className="mt-3 space-y-5">
                {renderSection(ADVANCED_NAV_GROUP)}
              </div>
            )}
          </div>
        )}
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
