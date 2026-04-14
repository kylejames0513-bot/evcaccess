"use client";

import { useMemo, useState } from "react";
import styles from "./training-hub.module.css";
import {
  FRONTEND_ALERTS,
  FRONTEND_EMPLOYEES,
  FRONTEND_KPIS,
  FRONTEND_NAV_ITEMS,
  FRONTEND_SESSIONS,
  type HubScreen,
} from "@/lib/training/frontend-mock";

export function TrainingHubApp() {
  const [activeView, setActiveView] = useState<HubScreen>("dashboard");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeStatus, setEmployeeStatus] = useState<"all" | "active" | "leave" | "inactive">(
    "all",
  );

  const filteredEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    return FRONTEND_EMPLOYEES.filter((employee) => {
      const matchesQuery =
        !query ||
        employee.name.toLowerCase().includes(query) ||
        employee.division.toLowerCase().includes(query) ||
        employee.role.toLowerCase().includes(query) ||
        employee.manager.toLowerCase().includes(query);
      const matchesStatus = employeeStatus === "all" || employee.status === employeeStatus;
      return matchesQuery && matchesStatus;
    });
  }, [employeeQuery, employeeStatus]);

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <h1>Training Hub</h1>
          <p>Frontend-first rework preview</p>
        </div>

        <nav className={styles.nav}>
          {FRONTEND_NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={item.key === activeView ? styles.navButtonActive : styles.navButton}
              onClick={() => setActiveView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <h2>{FRONTEND_NAV_ITEMS.find((item) => item.key === activeView)?.label ?? "Dashboard"}</h2>
            <p>
              Product UI and flow validation mode. Backend wiring comes after front-end approval.
            </p>
          </div>
          <div>
            <button className={styles.secondaryButton}>New Session</button>
            <button className={styles.primaryButton}>Run Sync</button>
          </div>
        </header>

        {activeView === "dashboard" ? (
          <>
            <section className={styles.overviewGrid}>
              {FRONTEND_KPIS.map((metric) => (
                <article key={metric.label} className={styles.card}>
                  <p className={styles.cardLabel}>{metric.label}</p>
                  <p className={styles.cardValue}>{metric.value}</p>
                  <p
                    className={
                      metric.deltaTone === "positive"
                        ? styles.statusGood
                        : metric.deltaTone === "warning"
                          ? styles.statusWarn
                          : styles.panelHint
                    }
                  >
                    {metric.delta}
                  </p>
                </article>
              ))}
            </section>

            <section className={styles.grid2}>
              <article className={styles.panel}>
                <h3>Training Health</h3>
                <ul className={styles.timeline}>
                  {FRONTEND_ALERTS.map((alert) => (
                    <li key={alert.id} className={styles.timelineItem}>
                      <div>
                        <p className={styles.timelineMeta}>{alert.tone.toUpperCase()}</p>
                        <p className={styles.timelineTitle}>{alert.title}</p>
                        <p className={styles.panelHint}>{alert.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>

              <article className={styles.panel}>
                <h3>Upcoming Sessions</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Training</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Instructor</th>
                        <th>Enrollment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FRONTEND_SESSIONS.map((session) => (
                        <tr key={session.id}>
                          <td>{session.trainingName}</td>
                          <td>{session.date}</td>
                          <td>{session.location}</td>
                          <td>{session.instructor}</td>
                          <td>
                            {session.enrolled}/{session.capacity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </>
        ) : null}

        {activeView === "employees" ? (
          <section className={styles.panel}>
            <div className={styles.controlsRow}>
              <h3>Employee Roster</h3>
              <div className={styles.filterGroup}>
                <span>Status</span>
                <select
                  value={employeeStatus}
                  onChange={(event) =>
                    setEmployeeStatus(event.currentTarget.value as "all" | "active" | "leave" | "inactive")
                  }
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="leave">Leave</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <input
              className={styles.secondaryButton}
              style={{ width: "100%", marginBottom: "0.75rem", textAlign: "left", fontWeight: 400 }}
              placeholder="Search employee, division, role, or manager"
              value={employeeQuery}
              onChange={(event) => setEmployeeQuery(event.currentTarget.value)}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Division</th>
                    <th>Role</th>
                    <th>Manager</th>
                    <th>Status</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((employee) => (
                    <tr key={employee.id}>
                      <td>{employee.name}</td>
                      <td>{employee.division}</td>
                      <td>{employee.role}</td>
                      <td>{employee.manager}</td>
                      <td>
                        <span
                          className={`${styles.pill} ${
                            employee.status === "active"
                              ? styles.pillCompliant
                              : employee.status === "leave"
                                ? styles.pillDueSoon
                                : styles.pillOverdue
                          }`}
                        >
                          {employee.status}
                        </span>
                      </td>
                      <td>
                        {employee.overdueTrainings > 0
                          ? `${employee.overdueTrainings} overdue`
                          : employee.dueSoonTrainings > 0
                            ? `${employee.dueSoonTrainings} due soon`
                            : "Good standing"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeView === "sessions" ? (
          <section className={styles.panel}>
            <h3>Session Planning Board</h3>
            <p className={styles.panelHint}>
              Frontend flow preview for managing capacity, instructors, and enrollment before backend wiring.
            </p>
          </section>
        ) : null}

        {activeView === "compliance" ? (
          <section className={styles.panel}>
            <h3>Compliance Review Workspace</h3>
            <p className={styles.panelHint}>
              This screen will host filters, exception workflows, and manager escalation actions.
            </p>
          </section>
        ) : null}

        {activeView === "new-hires" ? (
          <section className={styles.panel}>
            <h3>New Hire Ramp Tracker</h3>
            <p className={styles.panelHint}>
              UX scaffold for onboarding progress, completion milestones, and orientation readiness.
            </p>
          </section>
        ) : null}

        {activeView === "reports" ? (
          <section className={styles.panel}>
            <h3>Reporting Studio</h3>
            <p className={styles.panelHint}>
              Planned for export scheduling, saved report templates, and manager-level snapshots.
            </p>
          </section>
        ) : null}

        {activeView === "sync" ? (
          <section className={styles.panel}>
            <h3>Sync Integration Console</h3>
            <p className={styles.panelHint}>
              Intended for connection health, one-time push triggers, run history, and sync diagnostics.
            </p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
