"use client";

import { useEffect, useMemo, useState } from "react";
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

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
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

export function TrainingHubApp() {
  const [activeView, setActiveView] = useState<HubScreen>("dashboard");
  const [refreshToken, setRefreshToken] = useState(0);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState<EmployeeFilter>("all");
  const [complianceSearch, setComplianceSearch] = useState("");
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatusFilter>("all");
  const [reportType, setReportType] = useState<ReportType>("department");

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
            <button type="button" className={styles.secondaryButton} onClick={retryActiveView}>
              Refresh data
            </button>
          </div>
        </header>

        <section className={styles.overviewGrid}>
          <article className={styles.card}>
            <p className={styles.cardLabel}>Fully compliant</p>
            <p className={styles.cardValue}>
              {dashboardApi.data
                ? `${dashboardApi.data.compliance.current}/${dashboardApi.data.compliance.totalRows}`
                : "--"}
            </p>
            <p className={styles.statusGood}>Current employees in full standing</p>
          </article>
          <article className={styles.card}>
            <p className={styles.cardLabel}>Expiring soon</p>
            <p className={styles.cardValue}>{dashboardApi.data?.compliance.expiringSoon ?? "--"}</p>
            <p className={styles.statusWarn}>Within the upcoming window</p>
          </article>
          <article className={styles.card}>
            <p className={styles.cardLabel}>Upcoming sessions</p>
            <p className={styles.cardValue}>{dashboardApi.data?.sessions.upcomingCount ?? "--"}</p>
            <p className={styles.panelHint}>Next: {formatDate(dashboardApi.data?.sessions.nextDate)}</p>
          </article>
          <article className={styles.card}>
            <p className={styles.cardLabel}>New hires at risk</p>
            <p className={styles.cardValue}>{dashboardApi.data?.newHires.atRiskCount ?? "--"}</p>
            <p className={styles.panelHint}>
              Avg progress: {dashboardApi.data ? `${dashboardApi.data.newHires.avgProgressPct}%` : "--"}
            </p>
          </article>
          <article className={styles.card}>
            <p className={styles.cardLabel}>Separations (30d)</p>
            <p className={styles.cardValue}>{dashboardApi.data?.separations.separatedLast30Days ?? "--"}</p>
            <p className={styles.panelHint}>
              Total separated: {dashboardApi.data?.separations.totalSeparated ?? "--"}
            </p>
          </article>
          <article className={styles.card}>
            <p className={styles.cardLabel}>Last sync</p>
            <p className={styles.cardValue}>{formatDate(dashboardApi.data?.sync.lastSyncAt)}</p>
            <p className={dashboardApi.data?.sync.stale ? styles.statusBad : styles.statusGood}>
              {dashboardApi.data?.sync.stale ? "Stale (> 24h)" : "Fresh sync window"}
            </p>
          </article>
        </section>

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
                        <th>Employee</th>
                        <th>Training</th>
                        <th>Status</th>
                        <th>Expires</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardApi.data?.highlights.topComplianceRisk.map((item) => (
                        <tr key={`${item.employee}-${item.training}`}>
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
                          <td>{percentage(completed, employee.total_required)}</td>
                          <td>{employee.counts.expired}</td>
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
              <p className={styles.panelHint}>Live class roster with enrollment and no-show visibility.</p>
            </div>

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
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleApi.data?.sessions.map((session) => (
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
                      </tr>
                    ))}
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
                        <td>{percentage(hire.completedTrainings, hire.totalTrainings)}</td>
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
