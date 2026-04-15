"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  PRIMARY_NAV_GROUPS,
  ADVANCED_NAV_GROUP,
  isNavItemActive,
  type NavGroup,
} from "@/config/navigation";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const pathname = usePathname();
  const hasAdvancedActive =
    ADVANCED_NAV_GROUP?.items.some((item) => isNavItemActive(pathname, item)) ?? false;

  function renderSection(section: NavGroup) {
    return (
      <div key={section.id}>
        <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-500">{section.title}</p>
        <div className="space-y-0.5">
          {section.items.map((item) => {
            const isActive = isNavItemActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  setOpen(false);
                  setAdvancedOpen(false);
                }}
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
    );
  }

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
          {PRIMARY_NAV_GROUPS.map(renderSection)}
          {ADVANCED_NAV_GROUP ? (
            <div>
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-semibold border transition-colors ${
                  hasAdvancedActive
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Advanced
                {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {advancedOpen ? <div className="mt-3">{renderSection(ADVANCED_NAV_GROUP)}</div> : null}
            </div>
          ) : null}
        </nav>
      )}
    </div>
  );
}
