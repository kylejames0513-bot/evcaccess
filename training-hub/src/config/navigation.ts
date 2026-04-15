import type { ComponentType } from "react";
import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileSearch,
  Home,
  Import,
  Inbox,
  ListChecks,
  Settings,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";

export type NavMatchMode = "exact" | "prefix";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  match?: NavMatchMode;
}

export interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
  isAdvanced?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    title: "Home",
    items: [{ href: "/", label: "Hub Overview", icon: Home, match: "exact" }],
  },
  {
    id: "workflows",
    title: "Workflows",
    items: [
      { href: "/workflows", label: "Workflow Hub", icon: Workflow, match: "exact" },
      { href: "/workflows/new-hire", label: "New Hire Workflow", icon: UserPlus, match: "exact" },
      { href: "/workflows/separation", label: "Separation Workflow", icon: UserMinus, match: "exact" },
    ],
  },
  {
    id: "training_ops",
    title: "Training Ops",
    items: [
      { href: "/compliance", label: "Compliance", icon: ClipboardCheck },
      { href: "/schedule", label: "Schedule", icon: CalendarPlus },
      { href: "/attendance", label: "Attendance", icon: UserCheck },
    ],
  },
  {
    id: "people_reporting",
    title: "People & Reporting",
    items: [
      { href: "/employees", label: "Employees", icon: Users },
      { href: "/reports", label: "Separation Summary", icon: BarChart3 },
    ],
  },
  {
    id: "admin",
    title: "Admin",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/data-health", label: "Data Quality", icon: ShieldCheck },
      { href: "/sync", label: "Sync Health", icon: Database },
    ],
  },
  {
    id: "advanced",
    title: "Advanced",
    isAdvanced: true,
    items: [
      { href: "/operations", label: "Today / Operations", icon: Briefcase },
      { href: "/imports", label: "Imports", icon: Import },
      { href: "/review", label: "Review Queue", icon: ListChecks },
      { href: "/roster-queue", label: "Roster Queue", icon: Inbox },
      { href: "/tracker/new-hires", label: "New Hire Workbook Rows", icon: ClipboardList },
      { href: "/tracker/separations", label: "Separation Workbook Rows", icon: AlertTriangle },
      { href: "/required-trainings", label: "Required Trainings", icon: FileSearch },
    ],
  },
];

export const PRIMARY_NAV_GROUPS = NAV_GROUPS.filter((group) => !group.isAdvanced);
export const ADVANCED_NAV_GROUP = NAV_GROUPS.find((group) => group.isAdvanced) ?? null;

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const mode = item.match ?? "prefix";
  if (mode === "exact") return pathname === item.href;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
