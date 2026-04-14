"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import styles from "./training-hub.module.css";

type HubScreen = "dashboard" | "employees" | "sessions" | "compliance" | "new-hires" | "reports" | "sync";
type ComplianceStatusFilter = "all" | "current" | "expiring_soon" | "expired" | "needed" | "excused";
type EmployeeFilter =
  | "all"
  | "active"
  | "inactive"
  | "current"
  | "expiring_soon"
  | "expired"
  | "needed";
type ReportType = "department" | "training" | "forecast" | "needs" | "separations";

interface HubOverviewResponse {
  compliance: {
    totalRows: number;
    current: number;
    expiringSoon: number;
    expired: number;
    needed: number;
    excused: number;
  };
  sessions: {
    upcomingCount: number;
    nextDate: string | null;
  };
  newHires: {
    count: number;
    avgProgressPct: number;
    atRiskCount: number;
  };
  separations: {
    totalSeparated: number;
    separatedLast30Days: number;
  };
  sync: {
    lastSyncAt: string | null;
    stale: boolean;
  };
  highlights: {
    topComplianceRisk: Array<{
      employee: string;
      training: string;
      status: string;
      expirationDate: string | null;
    }>;
    nextSessions: Array<{
      id: string;
      training: string;
      sessionDate: string;
      startTime: string | null;
      enrolledCount: number;
      capacity: number;
    }>;
  };
}

interface EmployeeRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  paylocity_id: string | null;
  department: string | null;
  job_title: string | null;
  is_active: boolean;
  status: "expired" | "expiring_soon" | "needed" | "current";
  counts: {
    current: number;
    expired: number;
    expiring: number;
    needed: number;
    excused: number;
  };
  total_required: number;
}

interface EmployeesResponse {
  employees: EmployeeRow[];
}

interface ScheduledSession {
  id: string;
  training: string;
  date: string;
  time: string;
  endTime: string;
  location: string;
  enrolled: string[];
  noShows: string[];
  capacity: number;
  status: "scheduled" | "completed";
}

interface ScheduleResponse {
  sessions: ScheduledSession[];
}

interface SessionActionFeedback {
  kind: "success" | "error";
  text: string;
}

interface ComplianceRow {
  employee_id: string | null;
  training_type_id: number | null;
  first_name: string | null;
  last_name: string | null;
  division: string | null;
  department: string | null;
  position: string | null;
  training_name: string | null;
  status: "current" | "expiring_soon" | "expired" | "needed" | "excused" | null;
  completion_date: string | null;
  expiration_date: string | null;
  tier?: string;
}

interface ComplianceResponse {
  rows: ComplianceRow[];
  summary: {
    total_active_employees: number;
    status_counts: {
      current: number;
      expiring_soon: number;
      expired: number;
      needed: number;
      excused: number;
    };
  };
}

interface NewHireRow {
  name: string;
  employeeId: string;
  division: string;
  hireDate: string;
  daysEmployed: number;
  totalTrainings: number;
  completedTrainings: number;
  missingTrainings: string[];
}

interface NewHiresResponse {
  newHires: NewHireRow[];
}

interface ReportsResponse {
  departments?: Array<{
    division: string;
    employeeCount: number;
    expired: number;
    expiring: number;
    needed: number;
    complianceRate: number;
  }>;
  trainings?: Array<{
    name: string;
    completed: number;
    expired: number;
    expiring: number;
    needed: number;
    completionRate: number;
  }>;
  months?: Array<{
    month: string;
    year: number;
    count: number;
  }>;
  overdue?: {
    count: number;
  };
  employees?: Array<{
    employee: string;
    division: string;
    missing?: Array<{ training: string; status: string }>;
    separationDate?: string | null;
  }>;
  summary?: {
    totalSeparated?: number;
    separatedThisMonth?: number;
    separatedLast30Days?: number;
  };
  byDivision?: Array<{
    division: string;
    count: number;
    percentOfTotal: number;
  }>;
}

interface SyncStatusResponse {
  counts: {
    activeEmployees: number;
    trainingRecords: number;
    excusals: number;
    upcomingSessions: number;
  };
  lastSync: {
    timestamp: string;
    source: string;
    applied: number;
    skipped: number;
    errors: number;
  } | null;
  recentSyncs: Array<{
    timestamp: string;
    source: string;
    applied: number;
    skipped: number;
    errors: number;
  }>;
}

type ScheduleAction = "create" | "enroll" | "remove";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface StatTile {
  label: string;
  value: string;
  sublabel: string;
  tone: "neutral" | "good" | "warn" | "bad";
}

interface MiniStat {
  label: string;
  value: string;
  note?: string;
  tone?: StatTile["tone"];
}

const NAV_ITEMS: Array<{ key: HubScreen; label: string; hint: string }> = [
  { key: "dashboard", label: "Dashboard", hint: "Live KPI summary" },
  { key: "employees", label: "Employees", hint: "Roster + risk" },
  { key: "sessions", label: "Sessions", hint: "Upcoming classes" },
  { key: "compliance", label: "Compliance", hint: "Line-item detail" },
  { key: "new-hires", label: "New Hires", hint: "Onboarding progress" },
  { key: "reports", label: "Reports", hint: "Operational analytics" },
  { key: "sync", label: "Sync", hint: "Integration health" },
];

function useApiData<T>(url: string, refreshToken: number, enabled: boolean): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Request failed (${response.status})`);
        }
        const body = (await response.json()) as T;
        if (!cancelled) {
          setData(body);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Unexpected error while loading data.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, refreshToken, url]);

  return { data, loading, error };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function formatDateTime(dateValue: string | null | undefined, timeValue: string | null | undefined): string {
  if (!dateValue) return "--";
  const dateLabel = formatDate(dateValue);
  return timeValue ? `${dateLabel} ${timeValue}` : dateLabel;
}

function statusClass(status: string | null): string {
  if (status === "current" || status === "active") return styles.pillCompliant;
  if (status === "expiring_soon") return styles.pillDueSoon;
  if (status === "needed") return styles.pillNeeded;
  if (status === "expired") return styles.pillOverdue;
  return styles.pillInactive;
}

function percentage(completed: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((completed / total) * 100)}%`;
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return "--";
  return value.toLocaleString();
}

function toneClass(tone: StatTile["tone"]): string {
  if (tone === "good") return styles.statusGood;
  if (tone === "warn") return styles.statusWarn;
  if (tone === "bad") return styles.statusBad;
  return styles.panelHint;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function progressWidth(completed: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = Math.round((completed / total) * 100);
  return `${Math.max(0, Math.min(100, pct))}%`;
}

function toInputDateFromDisplay(value: string): string {
  // "4/14/2026" -> "2026-04-14" (best-effort)
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate(),
  ).padStart(2, "0")}`;
}

export function TrainingHubApp() {
  const [activeView, setActiveView] = useState<HubScreen>("dashboard");
  const [refreshToken, setRefreshToken] = useState(0);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState<EmployeeFilter>("all");
  const [complianceSearch, setComplianceSearch] = useState("");
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatusFilter>("all");
  const [reportType, setReportType] = useState<ReportType>("department");
  const [scheduleTraining, setScheduleTraining] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleLocation, setScheduleLocation] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleSessionId, setScheduleSessionId] = useState("");
  const [scheduleEmployeeName, setScheduleEmployeeName] = useState("");
  const [scheduleActionBusy, setScheduleActionBusy] = useState<ScheduleAction | null>(null);
  const [scheduleActionFeedback, setScheduleActionFeedback] = useState<SessionActionFeedback | null>(null);

  const dashboardApi = useApiData<HubOverviewResponse>("/api/hub-overview", refreshToken, true);
  const employeesApi = useApiData<EmployeesResponse>(
    "/api/employees?active=all",
    refreshToken,
    activeView === "employees",
  );
  const scheduleApi = useApiData<ScheduleResponse>("/api/schedule", refreshToken, activeView === "sessions");
  const complianceUrl =
    complianceStatus === "all" ? "/api/compliance" : `/api/compliance?status=${complianceStatus}`;
  const complianceApi = useApiData<ComplianceResponse>(
    complianceUrl,
    refreshToken,
    activeView === "compliance",
  );
  const newHiresApi = useApiData<NewHiresResponse>("/api/new-hires", refreshToken, activeView === "new-hires");
  const reportsApi = useApiData<ReportsResponse>(
    `/api/reports?type=${reportType}`,
    refreshToken,
    activeView === "reports",
  );
  const syncApi = useApiData<SyncStatusResponse>("/api/sync-status", refreshToken, activeView === "sync");

  const sessionsByTraining = useMemo(() => {
    const map = new Map<string, ScheduledSession[]>();
    const sessions = scheduleApi.data?.sessions ?? [];
    for (const session of sessions) {
      const list = map.get(session.training) ?? [];
      list.push(session);
      map.set(session.training, list);
    }
    return map;
  }, [scheduleApi.data?.sessions]);

  const filteredEmployees = useMemo(() => {
    const rows = employeesApi.data?.employees ?? [];
    const query = employeeSearch.trim().toLowerCase();
    return rows.filter((row) => {
      const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim().toLowerCase();
      const role = (row.job_title ?? "").toLowerCase();
      const division = (row.department ?? "").toLowerCase();
      const paylocityId = (row.paylocity_id ?? "").toLowerCase();
      const matchesQuery =
        query.length === 0 ||
        fullName.includes(query) ||
        role.includes(query) ||
        division.includes(query) ||
        paylocityId.includes(query);

      const matchesFilter =
        employeeFilter === "all" ||
        (employeeFilter === "active" && row.is_active) ||
        (employeeFilter === "inactive" && !row.is_active) ||
        (employeeFilter === row.status && row.is_active);

      return matchesQuery && matchesFilter;
    });
  }, [employeeFilter, employeeSearch, employeesApi.data?.employees]);

  const filteredComplianceRows = useMemo(() => {
    const rows = complianceApi.data?.rows ?? [];
    const query = complianceSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const employeeName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim().toLowerCase();
      const trainingName = (row.training_name ?? "").toLowerCase();
      const division = (row.division ?? row.department ?? "").toLowerCase();
      return employeeName.includes(query) || trainingName.includes(query) || division.includes(query);
    });
  }, [complianceApi.data?.rows, complianceSearch]);

  const topStats = useMemo<StatTile[]>(() => {
    const d = dashboardApi.data;
    if (!d) {
      return [
        { label: "Compliance Coverage", value: "--", sublabel: "Waiting for live data", tone: "neutral" },
        { label: "Expiring Soon", value: "--", sublabel: "Window not loaded", tone: "neutral" },
        { label: "Overdue", value: "--", sublabel: "Risk status unavailable", tone: "neutral" },
        { label: "Upcoming Sessions", value: "--", sublabel: "Schedule not loaded", tone: "neutral" },
      ];
    }

    const total = d.compliance.totalRows;
    const coveragePct = total > 0 ? Math.round((d.compliance.current / total) * 100) : 0;
    const stale = d.sync.stale;

    return [
      {
        label: "Compliance Coverage",
        value: `${coveragePct}%`,
        sublabel: `${formatNumber(d.compliance.current)} of ${formatNumber(total)} current`,
        tone: coveragePct >= 90 ? "good" : coveragePct >= 80 ? "warn" : "bad",
      },
      {
        label: "Expiring Soon",
        value: formatNumber(d.compliance.expiringSoon),
        sublabel: "Employees entering renewal window",
        tone: d.compliance.expiringSoon > 0 ? "warn" : "good",
      },
      {
        label: "Overdue",
        value: formatNumber(d.compliance.expired),
        sublabel: "Requires immediate follow-up",
        tone: d.compliance.expired > 0 ? "bad" : "good",
      },
      {
        label: "Upcoming Sessions",
        value: formatNumber(d.sessions.upcomingCount),
        sublabel: stale ? "Sync stale, verify schedule feed" : `Next: ${formatDate(d.sessions.nextDate)}`,
        tone: stale ? "warn" : "neutral",
      },
    ];
  }, [dashboardApi.data]);

  const totalEmployees = employeesApi.data?.employees.length ?? 0;
  const activeEmployees = employeesApi.data?.employees.filter((e) => e.is_active).length ?? 0;
  const employeeSnapshot =
    totalEmployees > 0 ? `${formatNumber(activeEmployees)} active of ${formatNumber(totalEmployees)}` : "No employees loaded";

  const employeeMiniStats = useMemo<MiniStat[]>(() => {
    const rows = employeesApi.data?.employees ?? [];
    const active = rows.filter((row) => row.is_active).length;
    const expired = rows.filter((row) => row.status === "expired").length;
    const expiring = rows.filter((row) => row.status === "expiring_soon").length;
    const completionRates = rows.map((row) => {
      const completed = row.counts.current + row.counts.excused;
      return row.total_required > 0 ? (completed / row.total_required) * 100 : 0;
    });
    const avgCompletion = Math.round(average(completionRates));

    return [
      {
        label: "Roster Size",
        value: formatNumber(rows.length),
        note: `${formatNumber(active)} active`,
      },
      {
        label: "Expired Risk",
        value: formatNumber(expired),
        note: "Employees with overdue items",
        tone: expired > 0 ? "bad" : "good",
      },
      {
        label: "Expiring Soon",
        value: formatNumber(expiring),
        note: "Needs scheduling soon",
        tone: expiring > 0 ? "warn" : "good",
      },
      {
        label: "Avg Completion",
        value: `${avgCompletion}%`,
        note: "Across required trainings",
        tone: avgCompletion >= 85 ? "good" : "warn",
      },
    ];
  }, [employeesApi.data?.employees]);

  const sessionMiniStats = useMemo<MiniStat[]>(() => {
    const sessions = scheduleApi.data?.sessions ?? [];
    const total = sessions.length;
    const full = sessions.filter((session) => session.capacity > 0 && session.enrolled.length >= session.capacity).length;
    const noShows = sessions.reduce((sum, session) => sum + session.noShows.length, 0);
    const fillRates = sessions
      .filter((session) => session.capacity > 0)
      .map((session) => (session.enrolled.length / session.capacity) * 100);
    const avgFill = Math.round(average(fillRates));

    return [
      { label: "Upcoming Sessions", value: formatNumber(total), note: "Scheduled / in-progress" },
      { label: "Average Fill Rate", value: `${avgFill}%`, note: "Enrollment utilization" },
      {
        label: "Full Sessions",
        value: formatNumber(full),
        note: "At or above capacity",
        tone: full > 0 ? "warn" : "good",
      },
      {
        label: "No-Show Flags",
        value: formatNumber(noShows),
        note: "Marked across loaded sessions",
        tone: noShows > 0 ? "warn" : "neutral",
      },
    ];
  }, [scheduleApi.data?.sessions]);

  const scheduleByTrainingMiniStats = useMemo<MiniStat[]>(() => {
    const sessions = scheduleApi.data?.sessions ?? [];
    if (sessions.length === 0) {
      return [{ label: "Training Buckets", value: "0", note: "No sessions loaded yet" }];
    }
    const grouped = [...sessionsByTraining.entries()].sort((a, b) => b[1].length - a[1].length);
    return grouped.slice(0, 4).map(([training, groupedSessions]) => {
      const openSeats = groupedSessions.reduce(
        (sum, session) => sum + Math.max(0, session.capacity - session.enrolled.length),
        0,
      );
      return {
        label: training,
        value: `${groupedSessions.length} session${groupedSessions.length === 1 ? "" : "s"}`,
        note: `${openSeats} open seat${openSeats === 1 ? "" : "s"}`,
        tone: openSeats === 0 ? "warn" : "neutral",
      };
    });
  }, [scheduleApi.data?.sessions, sessionsByTraining]);

  const complianceMiniStats = useMemo<MiniStat[]>(() => {
    const summary = complianceApi.data?.summary.status_counts;
    if (!summary) {
      return [
        { label: "Current", value: "--" },
        { label: "Expiring Soon", value: "--" },
        { label: "Expired", value: "--" },
        { label: "Needed", value: "--" },
      ];
    }
    return [
      { label: "Current", value: formatNumber(summary.current), tone: "good" },
      { label: "Expiring Soon", value: formatNumber(summary.expiring_soon), tone: "warn" },
      { label: "Expired", value: formatNumber(summary.expired), tone: summary.expired > 0 ? "bad" : "good" },
      { label: "Needed", value: formatNumber(summary.needed), tone: summary.needed > 0 ? "warn" : "neutral" },
    ];
  }, [complianceApi.data?.summary.status_counts]);

  const newHireMiniStats = useMemo<MiniStat[]>(() => {
    const hires = newHiresApi.data?.newHires ?? [];
    const atRisk = hires.filter((hire) => hire.missingTrainings.length > 0).length;
    const avgProgress = Math.round(
      average(
        hires.map((hire) =>
          hire.totalTrainings > 0 ? (hire.completedTrainings / hire.totalTrainings) * 100 : 0,
        ),
      ),
    );
    const under30Days = hires.filter((hire) => hire.daysEmployed <= 30).length;
    return [
      { label: "New Hires", value: formatNumber(hires.length), note: "In 90-day onboarding range" },
      { label: "At Risk", value: formatNumber(atRisk), note: "Missing one or more trainings", tone: atRisk > 0 ? "warn" : "good" },
      { label: "Avg Progress", value: `${avgProgress}%`, note: "Completion toward requirements" },
      { label: "First 30 Days", value: formatNumber(under30Days), note: "Needs close onboarding support" },
    ];
  }, [newHiresApi.data?.newHires]);

  const reportMiniStats = useMemo<MiniStat[]>(() => {
    const data = reportsApi.data;
    if (!data) return [{ label: "Report Summary", value: "--", note: "Loading report data" }];

    if (data.departments) {
      const avgRate = Math.round(average(data.departments.map((row) => row.complianceRate)));
      const highestRisk = data.departments[0];
      return [
        { label: "Divisions", value: formatNumber(data.departments.length), note: "Included in report" },
        { label: "Average Compliance", value: `${avgRate}%`, note: "Across all divisions" },
        {
          label: "Highest Risk Division",
          value: highestRisk?.division ?? "--",
          note: highestRisk ? `${highestRisk.complianceRate}% compliance` : "No division data",
          tone: highestRisk && highestRisk.complianceRate < 80 ? "bad" : "warn",
        },
      ];
    }

    if (data.trainings) {
      const avgRate = Math.round(average(data.trainings.map((row) => row.completionRate)));
      const weakest = data.trainings[0];
      return [
        { label: "Training Types", value: formatNumber(data.trainings.length), note: "Included in report" },
        { label: "Average Completion", value: `${avgRate}%`, note: "Across all training types" },
        {
          label: "Lowest Completion",
          value: weakest?.name ?? "--",
          note: weakest ? `${weakest.completionRate}% completion` : "No training data",
          tone: weakest && weakest.completionRate < 75 ? "bad" : "warn",
        },
      ];
    }

    if (data.months) {
      const total = data.months.reduce((sum, month) => sum + month.count, 0);
      const peak = [...data.months].sort((a, b) => b.count - a.count)[0];
      return [
        { label: "12-Month Forecast", value: formatNumber(total), note: "Projected expirations" },
        { label: "Overdue Today", value: formatNumber(data.overdue?.count ?? 0), note: "Currently overdue records", tone: (data.overdue?.count ?? 0) > 0 ? "bad" : "good" },
        {
          label: "Peak Month",
          value: peak ? `${peak.month} ${peak.year}` : "--",
          note: peak ? `${peak.count} projected expirations` : "No month data",
          tone: peak && peak.count > 0 ? "warn" : "neutral",
        },
      ];
    }

    if (data.summary) {
      return [
        { label: "Total Separated", value: formatNumber(data.summary.totalSeparated ?? 0), note: "All-time in current dataset" },
        { label: "Separated This Month", value: formatNumber(data.summary.separatedThisMonth ?? 0), note: "Current calendar month" },
        { label: "Separated (30 Days)", value: formatNumber(data.summary.separatedLast30Days ?? 0), note: "Rolling 30-day total" },
      ];
    }

    if (data.employees) {
      const topMissing = [...data.employees].sort((a, b) => (b.missing?.length ?? 0) - (a.missing?.length ?? 0))[0];
      return [
        { label: "Employees With Gaps", value: formatNumber(data.employees.length), note: "Who-needs-what matrix" },
        {
          label: "Highest Gap",
          value: topMissing?.employee ?? "--",
          note: topMissing ? `${topMissing.missing?.length ?? 0} missing trainings` : "No employee data",
          tone: topMissing && (topMissing.missing?.length ?? 0) > 0 ? "warn" : "neutral",
        },
      ];
    }

    return [{ label: "Report Summary", value: "--", note: "No rows returned" }];
  }, [reportsApi.data]);

  const syncMiniStats = useMemo<MiniStat[]>(() => {
    const data = syncApi.data;
    if (!data) {
      return [
        { label: "Active Employees", value: "--" },
        { label: "Training Records", value: "--" },
        { label: "Recent Sync Errors", value: "--" },
      ];
    }
    const recentErrorCount = data.recentSyncs.reduce((sum, row) => sum + row.errors, 0);
    return [
      { label: "Active Employees", value: formatNumber(data.counts.activeEmployees), note: "Current active roster" },
      { label: "Training Records", value: formatNumber(data.counts.trainingRecords), note: "Stored completion records" },
      {
        label: "Recent Sync Errors",
        value: formatNumber(recentErrorCount),
        note: "Across latest sync log entries",
        tone: recentErrorCount > 0 ? "bad" : "good",
      },
      {
        label: "Last Sync Source",
        value: data.lastSync?.source ?? "--",
        note: data.lastSync ? formatDate(data.lastSync.timestamp) : "No syncs logged yet",
      },
    ];
  }, [syncApi.data]);

  const reportCsvUrl = useMemo(() => {
    if (reportType === "separations") return "/api/export?type=employees";
    if (reportType === "department" || reportType === "training" || reportType === "needs") {
      return "/api/export?type=compliance";
    }
    return "/api/export?type=history";
  }, [reportType]);

  async function handleCreateSession(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setScheduleMessage(null);
    setScheduleError(null);
    setScheduleActionFeedback(null);

    if (!scheduleTraining.trim() || !scheduleDate.trim()) {
      setScheduleError("Training and date are required.");
      return;
    }

    setScheduleBusy(true);
    try {
      const response = await fetch("/api/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainingType: scheduleTraining.trim(),
          date: scheduleDate,
          time: scheduleTime.trim(),
          location: scheduleLocation.trim(),
          enrollees: [],
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to create session.");
      }
      setScheduleMessage(body.message ?? "Session created.");
      setScheduleTraining("");
      setScheduleDate("");
      setScheduleTime("");
      setScheduleLocation("");
      retryActiveView();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session.";
      setScheduleError(message);
    } finally {
      setScheduleBusy(false);
    }
  }

  async function handleSessionRosterAction(action: "enroll" | "remove"): Promise<void> {
    setScheduleActionFeedback(null);
    if (!scheduleSessionId.trim() || !scheduleEmployeeName.trim()) {
      setScheduleActionFeedback({
        kind: "error",
        text: "Pick a session and provide an employee name.",
      });
      return;
    }

    setScheduleActionBusy(action);
    try {
      const endpoint = action === "enroll" ? "/api/enroll" : "/api/remove-enrollee";
      const payload =
        action === "enroll"
          ? { sessionId: scheduleSessionId, names: [scheduleEmployeeName.trim()] }
          : { sessionId: scheduleSessionId, name: scheduleEmployeeName.trim() };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? `Failed to ${action} employee.`);
      }
      setScheduleActionFeedback({
        kind: "success",
        text: body.message ?? (action === "enroll" ? "Employee enrolled." : "Employee removed."),
      });
      setScheduleEmployeeName("");
      retryActiveView();
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to ${action} employee.`;
      setScheduleActionFeedback({ kind: "error", text: message });
    } finally {
      setScheduleActionBusy(null);
    }
  }

  async function autoFillSession(session: ScheduledSession): Promise<void> {
    setScheduleMessage(null);
    setScheduleError(null);
    const spotsLeft = Math.max(0, session.capacity - session.enrolled.length);
    if (spotsLeft <= 0) {
      setScheduleError("Session is already full.");
      return;
    }

    setScheduleBusy(true);
    try {
      const needsResponse = await fetch(`/api/needs-training?training=${encodeURIComponent(session.training)}`);
      const needsPayload = (await needsResponse.json().catch(() => ({}))) as {
        employees?: Array<{ name: string }>;
        error?: string;
      };
      if (!needsResponse.ok) {
        throw new Error(needsPayload.error ?? "Failed to load who-needs list.");
      }
      const toEnroll = (needsPayload.employees ?? [])
        .slice(0, spotsLeft)
        .map((row) => row.name)
        .filter(Boolean);
      if (toEnroll.length === 0) {
        setScheduleMessage("No eligible employees were returned for auto-fill.");
        return;
      }

      const enrollResponse = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          names: toEnroll,
        }),
      });
      const enrollPayload = (await enrollResponse.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!enrollResponse.ok || enrollPayload.success === false) {
        throw new Error(enrollPayload.error ?? enrollPayload.message ?? "Auto-fill failed.");
      }
      setScheduleMessage(enrollPayload.message ?? `Auto-filled ${toEnroll.length} employees.`);
      retryActiveView();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Auto-fill failed.");
    } finally {
      setScheduleBusy(false);
    }
  }

  async function archiveOrDeleteSession(sessionId: string, mode: "archive" | "delete"): Promise<void> {
    setScheduleMessage(null);
    setScheduleError(null);
    setScheduleBusy(true);
    try {
      if (mode === "archive") {
        const response = await fetch(`/api/sessions/${sessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "archive" }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Failed to archive session.");
        setScheduleMessage("Session archived.");
      } else {
        const response = await fetch("/api/delete-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
          error?: string;
        };
        if (!response.ok || payload.success === false) {
          throw new Error(payload.error ?? payload.message ?? "Failed to delete session.");
        }
        setScheduleMessage(payload.message ?? "Session deleted.");
      }
      retryActiveView();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Session update failed.");
    } finally {
      setScheduleBusy(false);
    }
  }

  async function copySessionMemo(sessionId: string, type: "memo_text" | "calendar_text"): Promise<void> {
    setScheduleMessage(null);
    setScheduleError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/memo`);
      const payload = (await response.json().catch(() => ({}))) as {
        memo_text?: string;
        calendar_text?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load memo.");
      }
      const text = payload[type];
      if (!text) throw new Error("Memo text is missing.");
      await navigator.clipboard.writeText(text);
      setScheduleMessage(type === "memo_text" ? "Class memo copied." : "Calendar block copied.");
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Copy failed.");
    }
  }

  async function markEmployeeStatus(employee: EmployeeRow, isActive: boolean): Promise<void> {
    setScheduleMessage(null);
    setScheduleError(null);
    try {
      const response = await fetch(`/api/employees/${employee.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update employee status.");
      }
      setScheduleMessage(isActive ? "Employee marked active." : "Employee marked inactive.");
      retryActiveView();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Status update failed.");
    }
  }

  function renderMiniStats(stats: MiniStat[]): ReactElement {
    return (
      <section className={styles.miniStatsGrid}>
        {stats.map((stat) => (
          <article key={`${stat.label}-${stat.value}`} className={styles.miniStatCard}>
            <p className={styles.miniStatLabel}>{stat.label}</p>
            <p className={styles.miniStatValue}>{stat.value}</p>
            {stat.note ? <p className={stat.tone ? toneClass(stat.tone) : styles.panelHint}>{stat.note}</p> : null}
          </article>
        ))}
      </section>
    );
  }

  function retryActiveView(): void {
    setRefreshToken((prev) => prev + 1);
  }

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h1>Training Hub</h1>
          <p>Live backend mode (restored)</p>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === activeView ? styles.navButtonActive : styles.navButton}
              onClick={() => setActiveView(item.key)}
            >
              <span className={styles.navLabel}>{item.label}</span>
              <span className={styles.navHint}>{item.hint}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <h2>{NAV_ITEMS.find((item) => item.key === activeView)?.label ?? "Dashboard"}</h2>
            <p className={styles.pageMeta}>
              Hub-first UI connected to restored backend routes for accurate, current data.
            </p>
          </div>
          <div className={styles.topbarActions}>
            <div className={styles.healthChip}>
              <span className={`${styles.healthDot} ${dashboardApi.data?.sync.stale ? styles.dotWarn : styles.dotGood}`} />
              <span>
                {dashboardApi.data?.sync.stale ? "Sync stale" : "Sync healthy"}
              </span>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={retryActiveView}>
              Refresh data
            </button>
          </div>
        </header>

        <section className={styles.heroGrid}>
          <article className={styles.heroCard}>
            <p className={styles.heroEyebrow}>Training Hub</p>
            <h3 className={styles.heroTitle}>Live operational command center</h3>
            <p className={styles.heroText}>
              Monitor compliance risk, training throughput, and sync health in one place. All sections below are backed by the restored backend routes.
            </p>
            <div className={styles.heroMetaRow}>
              <span className={styles.heroMetaLabel}>Roster snapshot</span>
              <span className={styles.heroMetaValue}>{employeeSnapshot}</span>
            </div>
            <div className={styles.heroMetaRow}>
              <span className={styles.heroMetaLabel}>Last sync</span>
              <span className={styles.heroMetaValue}>{formatDate(dashboardApi.data?.sync.lastSyncAt)}</span>
            </div>
          </article>
          <article className={styles.metricRail}>
            {topStats.map((stat) => (
              <div key={stat.label} className={styles.metricRow}>
                <div>
                  <p className={styles.cardLabel}>{stat.label}</p>
                  <p className={styles.metricValue}>{stat.value}</p>
                  <p className={toneClass(stat.tone)}>{stat.sublabel}</p>
                </div>
              </div>
            ))}
          </article>
        </section>

        {activeView !== "dashboard" && (
          <section className={styles.overviewGrid}>
            <article className={styles.card}>
              <p className={styles.cardLabel}>New hires at risk</p>
              <p className={styles.cardValue}>{formatNumber(dashboardApi.data?.newHires.atRiskCount)}</p>
              <p className={styles.panelHint}>
                Avg progress: {dashboardApi.data ? `${dashboardApi.data.newHires.avgProgressPct}%` : "--"}
              </p>
            </article>
            <article className={styles.card}>
              <p className={styles.cardLabel}>Separations (30d)</p>
              <p className={styles.cardValue}>{formatNumber(dashboardApi.data?.separations.separatedLast30Days)}</p>
              <p className={styles.panelHint}>
                Total separated: {formatNumber(dashboardApi.data?.separations.totalSeparated)}
              </p>
            </article>
            <article className={styles.card}>
              <p className={styles.cardLabel}>Coverage snapshot</p>
              <p className={styles.cardValue}>
                {dashboardApi.data
                  ? `${formatNumber(dashboardApi.data.compliance.current)}/${formatNumber(
                      dashboardApi.data.compliance.totalRows,
                    )}`
                  : "--"}
              </p>
              <p className={styles.panelHint}>Current vs total active employees</p>
            </article>
          </section>
        )}

        {activeView === "dashboard" && (
          <section className={styles.grid2}>
            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <h3 className={styles.panelTitle}>Top compliance risk</h3>
                <p className={styles.panelHint}>Prioritized from expired and expiring certifications.</p>
              </div>
              {dashboardApi.loading ? (
                <div className={styles.loadingPanel}>Loading dashboard insights...</div>
              ) : dashboardApi.error ? (
                <div className={styles.errorPanel}>
                  <p>{dashboardApi.error}</p>
                  <button type="button" className={styles.secondaryButton} onClick={retryActiveView}>
                    Retry
                  </button>
                </div>
              ) : (dashboardApi.data?.highlights.topComplianceRisk.length ?? 0) === 0 ? (
                <div className={styles.emptyState}>No current high-risk items.</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Priority</th>
                        <th>Employee</th>
                        <th>Training</th>
                        <th>Status</th>
                        <th>Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardApi.data?.highlights.topComplianceRisk.map((item, index) => (
                        <tr key={`${item.employee}-${item.training}`}>
                          <td>
                            <span className={styles.priorityBadge}>#{index + 1}</span>
                          </td>
                          <td>{item.employee}</td>
                          <td>{item.training}</td>
                          <td>
                            <span className={`${styles.pill} ${statusClass(item.status)}`}>{item.status}</span>
                          </td>
                          <td>{formatDate(item.expirationDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <h3 className={styles.panelTitle}>Next sessions</h3>
                <p className={styles.panelHint}>Auto-fed by the scheduling backend.</p>
              </div>
              {dashboardApi.loading ? (
                <div className={styles.loadingPanel}>Loading session highlights...</div>
              ) : dashboardApi.error ? (
                <div className={styles.errorPanel}>
                  <p>{dashboardApi.error}</p>
                  <button type="button" className={styles.secondaryButton} onClick={retryActiveView}>
                    Retry
                  </button>
                </div>
              ) : (dashboardApi.data?.highlights.nextSessions.length ?? 0) === 0 ? (
                <div className={styles.emptyState}>No upcoming sessions were found.</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Training</th>
                        <th>Start</th>
                        <th>Enrollment</th>
                        <th>Capacity health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardApi.data?.highlights.nextSessions.map((session) => (
                        <tr key={session.id}>
                          <td>{session.training}</td>
                          <td>{formatDateTime(session.sessionDate, session.startTime)}</td>
                          <td>
                            {session.enrolledCount}/{session.capacity}
                          </td>
                          <td>
                            {session.capacity > 0
                              ? `${Math.round((session.enrolledCount / session.capacity) * 100)}% full`
                              : "--"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        )}

        {activeView === "employees" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Employee roster and compliance rollup</h3>
              <p className={styles.panelHint}>Search by name, division, job title, or Paylocity ID.</p>
            </div>
            {renderMiniStats(employeeMiniStats)}
            <div className={styles.controlsRow}>
              <input
                className={styles.searchInput}
                placeholder="Search employees..."
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.currentTarget.value)}
              />
              <div className={styles.filterGroup}>
                <span>Filter</span>
                <select
                  value={employeeFilter}
                  onChange={(event) => setEmployeeFilter(event.currentTarget.value as EmployeeFilter)}
                >
                  <option value="all">All employees</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                  <option value="expired">Expired</option>
                  <option value="expiring_soon">Expiring soon</option>
                  <option value="needed">Needed</option>
                  <option value="current">Current</option>
                </select>
              </div>
            </div>

            {employeesApi.loading ? (
              <div className={styles.loadingPanel}>Loading employee roster...</div>
            ) : employeesApi.error ? (
              <div className={styles.errorPanel}>
                <p>{employeesApi.error}</p>
                <button type="button" className={styles.secondaryButton} onClick={retryActiveView}>
                  Retry
                </button>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className={styles.emptyState}>No employees matched the current filters.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Division</th>
                      <th>Job title</th>
                      <th>Employment</th>
                      <th>Compliance</th>
                      <th>Completed</th>
                      <th>Expired</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => {
                      const name = `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim();
                      const completed = employee.counts.current + employee.counts.excused;
                      return (
                        <tr key={employee.id}>
                          <td>{name || employee.id}</td>
                          <td>{employee.department ?? "--"}</td>
                          <td>{employee.job_title ?? "--"}</td>
                          <td>
                            <span
                              className={`${styles.pill} ${
                                employee.is_active ? styles.pillCompliant : styles.pillInactive
                              }`}
                            >
                              {employee.is_active ? "active" : "inactive"}
                            </span>
                          </td>
                          <td>
                            <span className={`${styles.pill} ${statusClass(employee.status)}`}>
                              {employee.status}
                            </span>
                          </td>
                          <td>
                            <div className={styles.progressCell}>
                              <span>{percentage(completed, employee.total_required)}</span>
                              <div className={styles.progressTrack}>
                                <div
                                  className={styles.progressFill}
                                  style={{ width: progressWidth(completed, employee.total_required) }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>{employee.counts.expired}</td>
                          <td>
                            <button
                              type="button"
                              className={styles.tinyButton}
                              onClick={() => void markEmployeeStatus(employee, !employee.is_active)}
                            >
                              {employee.is_active ? "Set inactive" : "Set active"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeView === "sessions" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Session schedule</h3>
              <p className={styles.panelHint}>Create classes, manage enrollments, and run memo workflows from one tab.</p>
            </div>
            {renderMiniStats(sessionMiniStats)}
            {renderMiniStats(scheduleByTrainingMiniStats)}

            <section className={styles.actionGrid}>
              <article className={styles.actionCard}>
                <p className={styles.actionTitle}>Create session</p>
                <p className={styles.actionHint}>Matches backup create-session workflow.</p>
                <form onSubmit={handleCreateSession}>
                  <div className={styles.fieldGrid}>
                    <input
                      className={styles.input}
                      placeholder="Training name"
                      value={scheduleTraining}
                      onChange={(event) => setScheduleTraining(event.currentTarget.value)}
                    />
                    <input
                      className={styles.input}
                      type="date"
                      value={scheduleDate}
                      onChange={(event) => setScheduleDate(event.currentTarget.value)}
                    />
                    <input
                      className={styles.input}
                      placeholder="Start time (optional)"
                      value={scheduleTime}
                      onChange={(event) => setScheduleTime(event.currentTarget.value)}
                    />
                    <input
                      className={styles.input}
                      placeholder="Location (optional)"
                      value={scheduleLocation}
                      onChange={(event) => setScheduleLocation(event.currentTarget.value)}
                    />
                  </div>
                  <div className={styles.actionRow}>
                    <button type="submit" className={styles.primaryButton} disabled={scheduleBusy}>
                      {scheduleBusy ? "Creating..." : "Create session"}
                    </button>
                  </div>
                </form>
              </article>

              <article className={styles.actionCard}>
                <p className={styles.actionTitle}>Quick roster actions</p>
                <p className={styles.actionHint}>Manual enroll/remove for a selected session.</p>
                <div className={styles.fieldGrid}>
                  <select
                    className={styles.select}
                    value={scheduleSessionId}
                    onChange={(event) => setScheduleSessionId(event.currentTarget.value)}
                  >
                    <option value="">Select session</option>
                    {(scheduleApi.data?.sessions ?? []).map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.training} · {session.date}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.input}
                    placeholder="Employee full name"
                    value={scheduleEmployeeName}
                    onChange={(event) => setScheduleEmployeeName(event.currentTarget.value)}
                  />
                </div>
                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={scheduleActionBusy !== null}
                    onClick={() => void handleSessionRosterAction("enroll")}
                  >
                    {scheduleActionBusy === "enroll" ? "Enrolling..." : "Enroll"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={scheduleActionBusy !== null}
                    onClick={() => void handleSessionRosterAction("remove")}
                  >
                    {scheduleActionBusy === "remove" ? "Removing..." : "Remove"}
                  </button>
                  {scheduleActionFeedback ? (
                    <span
                      className={
                        scheduleActionFeedback.kind === "success" ? styles.statusGood : styles.statusBad
                      }
                    >
                      {scheduleActionFeedback.text}
                    </span>
                  ) : null}
                </div>
              </article>
            </section>

            {scheduleMessage ? <p className={styles.statusGood}>{scheduleMessage}</p> : null}
            {scheduleError ? <p className={styles.statusBad}>{scheduleError}</p> : null}

            {scheduleApi.loading ? (
              <div className={styles.loadingPanel}>Loading schedule...</div>
            ) : scheduleApi.error ? (
              <div className={styles.errorPanel}>
                <p>{scheduleApi.error}</p>
                <button type="button" className={styles.secondaryButton} onClick={retryActiveView}>
                  Retry
                </button>
              </div>
            ) : (scheduleApi.data?.sessions.length ?? 0) === 0 ? (
              <div className={styles.emptyState}>No sessions are currently scheduled.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Training</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Location</th>
                      <th>Enrollment</th>
                      <th>No-shows</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(scheduleApi.data?.sessions ?? []).map((session) => {
                      const sessionDate = toInputDateFromDisplay(session.date);
                      return (
                        <tr key={session.id}>
                          <td>{session.training}</td>
                          <td>{session.date}</td>
                          <td>{session.time || "--"}</td>
                          <td>{session.location || "--"}</td>
                          <td>
                            {session.enrolled.length}/{session.capacity}
                          </td>
                          <td>{session.noShows.length}</td>
                          <td>
                            <span className={`${styles.pill} ${statusClass(session.status)}`}>{session.status}</span>
                          </td>
                          <td>
                            <div className={styles.inlineStack}>
                              {session.status === "scheduled" ? (
                                <button
                                  type="button"
                                  className={styles.tinyButton}
                                  onClick={() => {
                                    setScheduleTraining(session.training);
                                    setScheduleDate(sessionDate);
                                    setScheduleTime(session.time || "");
                                    setScheduleLocation(session.location || "");
                                  }}
                                >
                                  Edit copy
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={styles.tinyButton}
                                onClick={() => void autoFillSession(session)}
                                disabled={scheduleBusy}
                              >
                                Auto-fill
                              </button>
                              <button
                                type="button"
                                className={styles.tinyButton}
                                onClick={() => void copySessionMemo(session.id, "memo_text")}
                              >
                                Copy memo
                              </button>
                              <button
                                type="button"
                                className={styles.tinyButton}
                                onClick={() => void copySessionMemo(session.id, "calendar_text")}
                              >
                                Copy calendar
                              </button>
                              {session.status === "scheduled" ? (
                                <button
                                  type="button"
                                  className={`${styles.tinyButton} ${styles.tinyButtonWarn}`}
                                  onClick={() => void archiveOrDeleteSession(session.id, "archive")}
                                  disabled={scheduleBusy}
                                >
                                  Archive
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={`${styles.tinyButton} ${styles.tinyButtonDanger}`}
                                onClick={() => void archiveOrDeleteSession(session.id, "delete")}
                                disabled={scheduleBusy}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeView === "compliance" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Compliance line items</h3>
              <p className={styles.panelHint}>Direct read from employee_compliance with shared-key fixes.</p>
            </div>
            {renderMiniStats(complianceMiniStats)}
            <div className={styles.controlsRow}>
              <input
                className={styles.searchInput}
                placeholder="Search employee, training, or division..."
                value={complianceSearch}
                onChange={(event) => setComplianceSearch(event.currentTarget.value)}
              />
              <div className={styles.filterGroup}>
                <span>Status</span>
                <select
                  value={complianceStatus}
                  onChange={(event) =>
                    setComplianceStatus(event.currentTarget.value as ComplianceStatusFilter)
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="expired">Expired</option>
                  <option value="expiring_soon">Expiring soon</option>
                  <option value="needed">Needed</option>
                  <option value="current">Current</option>
                  <option value="excused">Excused</option>
                </select>
              </div>
            </div>

            {complianceApi.loading ? (
              <div className={styles.loadingPanel}>Loading compliance detail...</div>
            ) : complianceApi.error ? (
              <div className={styles.errorPanel}>
                <p>{complianceApi.error}</p>
                <button type="button" className={styles.secondaryButton} onClick={retryActiveView}>
                  Retry
                </button>
              </div>
            ) : filteredComplianceRows.length === 0 ? (
              <div className={styles.emptyState}>No compliance rows matched this view.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Division</th>
                      <th>Training</th>
                      <th>Status</th>
                      <th>Completed</th>
                      <th>Expires</th>
                      <th>Tier</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComplianceRows.map((row) => (
                      <tr key={`${row.employee_id}-${row.training_type_id}-${row.training_name}`}>
                        <td>{`${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()}</td>
                        <td>{row.division ?? row.department ?? "--"}</td>
                        <td>{row.training_name ?? "--"}</td>
                        <td>
                          <span className={`${styles.pill} ${statusClass(row.status)}`}>
                            {row.status ?? "unknown"}
                          </span>
                        </td>
                        <td>{formatDate(row.completion_date)}</td>
                        <td>{formatDate(row.expiration_date)}</td>
                        <td>{row.tier ?? "--"}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.tinyButton}
                            onClick={async () => {
                              const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
                              if (!name || !row.training_name) return;
                              setScheduleMessage(null);
                              setScheduleError(null);
                              try {
                                const response = await fetch("/api/training-notes", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    employee: name,
                                    training: row.training_name,
                                    note: `Follow-up from compliance tab (${row.status ?? "unknown"})`,
                                  }),
                                });
                                const body = (await response.json().catch(() => ({}))) as { error?: string };
                                if (!response.ok) throw new Error(body.error ?? "Failed to save follow-up note.");
                                setScheduleMessage(`Follow-up note saved for ${name}.`);
                              } catch (error) {
                                const message =
                                  error instanceof Error ? error.message : "Failed to save follow-up note.";
                                setScheduleError(message);
                              }
                            }}
                          >
                            Add follow-up note
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeView === "new-hires" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>New hire onboarding</h3>
              <p className={styles.panelHint}>Employees hired in the last 90 days with training progress.</p>
            </div>
            {renderMiniStats(newHireMiniStats)}
            {newHiresApi.loading ? (
              <div className={styles.loadingPanel}>Loading new hire progress...</div>
            ) : newHiresApi.error ? (
              <div className={styles.errorPanel}>
                <p>{newHiresApi.error}</p>
                <button type="button" className={styles.secondaryButton} onClick={retryActiveView}>
                  Retry
                </button>
              </div>
            ) : (newHiresApi.data?.newHires.length ?? 0) === 0 ? (
              <div className={styles.emptyState}>No new hires found in the last 90 days.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Division</th>
                      <th>Hire date</th>
                      <th>Days employed</th>
                      <th>Progress</th>
                      <th>Missing training</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newHiresApi.data?.newHires.map((hire) => (
                      <tr key={hire.employeeId}>
                        <td>{hire.name}</td>
                        <td>{hire.division || "--"}</td>
                        <td>{hire.hireDate}</td>
                        <td>{hire.daysEmployed}</td>
                        <td>
                          <div className={styles.progressCell}>
                            <span>{percentage(hire.completedTrainings, hire.totalTrainings)}</span>
                            <div className={styles.progressTrack}>
                              <div
                                className={styles.progressFill}
                                style={{ width: progressWidth(hire.completedTrainings, hire.totalTrainings) }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>{hire.missingTrainings.slice(0, 3).join(", ") || "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeView === "reports" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Reports and forecasting</h3>
              <p className={styles.panelHint}>Choose a report type to inspect backend analytics.</p>
            </div>
            {renderMiniStats(reportMiniStats)}
            <div className={styles.controlsRow}>
              <div className={styles.filterGroup}>
                <span>Type</span>
                <select
                  value={reportType}
                  onChange={(event) => setReportType(event.currentTarget.value as ReportType)}
                >
                  <option value="department">Department compliance</option>
                  <option value="training">Training completion</option>
                  <option value="forecast">Expiration forecast</option>
                  <option value="needs">Needs matrix</option>
                  <option value="separations">Separations</option>
                </select>
              </div>
              <a className={styles.secondaryButton} href={reportCsvUrl}>
                Export current report CSV
              </a>
            </div>

            {reportsApi.loading ? (
              <div className={styles.loadingPanel}>Loading report data...</div>
            ) : reportsApi.error ? (
              <div className={styles.errorPanel}>
                <p>{reportsApi.error}</p>
                <button type="button" className={styles.secondaryButton} onClick={retryActiveView}>
                  Retry
                </button>
              </div>
            ) : reportsApi.data?.departments ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Division</th>
                      <th>Employees</th>
                      <th>Compliance rate</th>
                      <th>Expired</th>
                      <th>Expiring</th>
                      <th>Needed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportsApi.data.departments.map((department) => (
                      <tr key={department.division}>
                        <td>{department.division}</td>
                        <td>{department.employeeCount}</td>
                        <td>{department.complianceRate}%</td>
                        <td>{department.expired}</td>
                        <td>{department.expiring}</td>
                        <td>{department.needed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : reportsApi.data?.trainings ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Training</th>
                      <th>Completion rate</th>
                      <th>Completed</th>
                      <th>Expired</th>
                      <th>Expiring</th>
                      <th>Needed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportsApi.data.trainings.map((training) => (
                      <tr key={training.name}>
                        <td>{training.name}</td>
                        <td>{training.completionRate}%</td>
                        <td>{training.completed}</td>
                        <td>{training.expired}</td>
                        <td>{training.expiring}</td>
                        <td>{training.needed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : reportsApi.data?.months ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Projected expirations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportsApi.data.months.map((month) => (
                      <tr key={`${month.year}-${month.month}`}>
                        <td>
                          {month.month} {month.year}
                        </td>
                        <td>{month.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : reportsApi.data?.summary ? (
              <>
                <section className={styles.overviewGrid}>
                  <article className={styles.card}>
                    <p className={styles.cardLabel}>Total separated</p>
                    <p className={styles.cardValue}>{reportsApi.data.summary.totalSeparated ?? "--"}</p>
                  </article>
                  <article className={styles.card}>
                    <p className={styles.cardLabel}>Separated this month</p>
                    <p className={styles.cardValue}>{reportsApi.data.summary.separatedThisMonth ?? "--"}</p>
                  </article>
                  <article className={styles.card}>
                    <p className={styles.cardLabel}>Separated (30d)</p>
                    <p className={styles.cardValue}>
                      {reportsApi.data.summary.separatedLast30Days ?? "--"}
                    </p>
                  </article>
                </section>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Division</th>
                        <th>Count</th>
                        <th>% of total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportsApi.data.byDivision?.map((row) => (
                        <tr key={row.division}>
                          <td>{row.division}</td>
                          <td>{row.count}</td>
                          <td>{row.percentOfTotal}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : reportsApi.data?.employees ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Division</th>
                      <th>Missing count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportsApi.data.employees.slice(0, 200).map((employee) => (
                      <tr key={`${employee.employee}-${employee.division}`}>
                        <td>{employee.employee}</td>
                        <td>{employee.division}</td>
                        <td>{employee.missing?.length ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyState}>No rows returned for this report type.</div>
            )}
          </section>
        )}

        {activeView === "sync" && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Sync health</h3>
              <p className={styles.panelHint}>Status from sync log and live record counters.</p>
            </div>
            {renderMiniStats(syncMiniStats)}
            {syncApi.loading ? (
              <div className={styles.loadingPanel}>Loading sync status...</div>
            ) : syncApi.error ? (
              <div className={styles.errorPanel}>
                <p>{syncApi.error}</p>
                <button type="button" className={styles.secondaryButton} onClick={retryActiveView}>
                  Retry
                </button>
              </div>
            ) : (
              <>
                <section className={styles.overviewGrid}>
                  <article className={styles.card}>
                    <p className={styles.cardLabel}>Active employees</p>
                    <p className={styles.cardValue}>{syncApi.data?.counts.activeEmployees ?? "--"}</p>
                  </article>
                  <article className={styles.card}>
                    <p className={styles.cardLabel}>Training records</p>
                    <p className={styles.cardValue}>{syncApi.data?.counts.trainingRecords ?? "--"}</p>
                  </article>
                  <article className={styles.card}>
                    <p className={styles.cardLabel}>Excusals</p>
                    <p className={styles.cardValue}>{syncApi.data?.counts.excusals ?? "--"}</p>
                  </article>
                  <article className={styles.card}>
                    <p className={styles.cardLabel}>Sessions (active)</p>
                    <p className={styles.cardValue}>{syncApi.data?.counts.upcomingSessions ?? "--"}</p>
                  </article>
                </section>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Source</th>
                        <th>Applied</th>
                        <th>Skipped</th>
                        <th>Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(syncApi.data?.recentSyncs ?? []).map((row) => (
                        <tr key={`${row.timestamp}-${row.source}`}>
                          <td>{formatDateTime(row.timestamp, null)}</td>
                          <td>{row.source}</td>
                          <td>{row.applied}</td>
                          <td>{row.skipped}</td>
                          <td>{row.errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
