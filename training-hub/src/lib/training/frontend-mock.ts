import type { RequiredTrainingKey } from "@/lib/training/types";

export type HubScreen =
  | "dashboard"
  | "employees"
  | "sessions"
  | "compliance"
  | "new-hires"
  | "reports"
  | "sync";

export interface FrontendSession {
  id: string;
  trainingKey: RequiredTrainingKey;
  trainingName: string;
  date: string;
  location: string;
  instructor: string;
  capacity: number;
  enrolled: number;
}

export interface FrontendEmployee {
  id: string;
  name: string;
  division: string;
  role: string;
  manager: string;
  status: "active" | "leave" | "inactive";
  overdueTrainings: number;
  dueSoonTrainings: number;
}

export interface FrontendKpi {
  label: string;
  value: string;
  delta: string;
  deltaTone: "positive" | "neutral" | "warning";
}

export interface FrontendAlert {
  id: string;
  title: string;
  detail: string;
  tone: "critical" | "warning" | "info";
}

export interface FrontendNavItem {
  key: HubScreen;
  label: string;
  hint: string;
}

export const FRONTEND_NAV_ITEMS: FrontendNavItem[] = [
  { key: "dashboard", label: "Dashboard", hint: "Ops snapshot" },
  { key: "employees", label: "Employees", hint: "Roster + status" },
  { key: "sessions", label: "Sessions", hint: "Upcoming classes" },
  { key: "compliance", label: "Compliance", hint: "Risk + expirations" },
  { key: "new-hires", label: "New Hires", hint: "Onboarding progress" },
  { key: "reports", label: "Reports", hint: "Scheduled exports" },
  { key: "sync", label: "Sync", hint: "External integrations" },
];

export const FRONTEND_KPIS: FrontendKpi[] = [
  {
    label: "Overall compliance",
    value: "91.8%",
    delta: "+1.6% vs last period",
    deltaTone: "positive",
  },
  {
    label: "Due in 30 days",
    value: "43",
    delta: "-9 from last week",
    deltaTone: "positive",
  },
  {
    label: "Overdue items",
    value: "17",
    delta: "+3 this week",
    deltaTone: "warning",
  },
  {
    label: "New hires in ramp",
    value: "12",
    delta: "2 pending orientation",
    deltaTone: "neutral",
  },
];

export const FRONTEND_ALERTS: FrontendAlert[] = [
  {
    id: "alert-1",
    title: "CPI renewals are approaching threshold",
    detail: "11 staff members expire in the next 14 days across Residential and Day Program.",
    tone: "warning",
  },
  {
    id: "alert-2",
    title: "Medication class at North campus is full",
    detail: "Move overflow staff to the 04/29 session or open another section.",
    tone: "info",
  },
  {
    id: "alert-3",
    title: "3 overdue CPR credentials",
    detail: "Escalation draft prepared for managers. Review before sending.",
    tone: "critical",
  },
];

export const FRONTEND_SESSIONS: FrontendSession[] = [
  {
    id: "S-1041",
    trainingKey: "med",
    trainingName: "Medication Administration",
    date: "2026-04-29 09:00",
    location: "North Campus",
    instructor: "M. Patel",
    capacity: 16,
    enrolled: 16,
  },
  {
    id: "S-1042",
    trainingKey: "cpi",
    trainingName: "CPI",
    date: "2026-04-30 13:00",
    location: "Main Campus",
    instructor: "A. Rivera",
    capacity: 20,
    enrolled: 14,
  },
  {
    id: "S-1043",
    trainingKey: "cpr",
    trainingName: "CPR / First Aid",
    date: "2026-05-02 10:00",
    location: "South Campus",
    instructor: "J. Chen",
    capacity: 18,
    enrolled: 12,
  },
];

export const FRONTEND_EMPLOYEES: FrontendEmployee[] = [
  {
    id: "E-2101",
    name: "Ariana Moss",
    division: "Residential",
    role: "Direct Support Professional",
    manager: "D. Collins",
    status: "active",
    overdueTrainings: 0,
    dueSoonTrainings: 1,
  },
  {
    id: "E-2102",
    name: "Miguel Santos",
    division: "Day Program",
    role: "Behavior Specialist",
    manager: "J. Miller",
    status: "active",
    overdueTrainings: 1,
    dueSoonTrainings: 2,
  },
  {
    id: "E-2103",
    name: "Chloe Bennett",
    division: "Nursing",
    role: "RN",
    manager: "R. White",
    status: "leave",
    overdueTrainings: 0,
    dueSoonTrainings: 0,
  },
  {
    id: "E-2104",
    name: "Nolan Reed",
    division: "Residential",
    role: "Program Supervisor",
    manager: "D. Collins",
    status: "active",
    overdueTrainings: 2,
    dueSoonTrainings: 1,
  },
];
