"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./training-hub.module.css";
import {
  PRIMARY_TRAININGS,
  REQUIRED_LOOKBACK_DAYS,
  REQUIRED_TRAININGS,
} from "@/lib/training/constants";
import {
  analyzeRecords,
  countExpiringSoon,
  dueStatusLabel,
  formatDate,
  formatPercent,
  trainingCoverage,
} from "@/lib/training/analysis";
import type { HubState, TrainingFilter } from "@/lib/training/types";

type StatusState = {
  kind: "idle" | "loading" | "success" | "error";
  message?: string;
};

export function TrainingHubApp() {
  const [trainingFilter, setTrainingFilter] = useState<TrainingFilter>("all");
  const [statusState, setStatusState] = useState<StatusState>({ kind: "idle" });
  const [hubState, setHubState] = useState<HubState | null>(null);

  const metrics = useMemo(() => {
    if (!hubState?.data) {
      return null;
    }

    return analyzeRecords(hubState.data.employees, hubState.data.records);
  }, [hubState]);

  const filteredRows = useMemo(() => {
    if (!metrics) {
      return [];
    }

    return metrics.rows.filter((row) => {
      if (trainingFilter === "all") {
        return true;
      }

      if (trainingFilter === "due-soon") {
        return row.isDueSoon;
      }

      if (trainingFilter === "overdue") {
        return row.isOverdue;
      }

      return row.trainingKey === trainingFilter;
    });
  }, [metrics, trainingFilter]);

  const coverageCards = useMemo(() => {
    if (!metrics) {
      return [];
    }

    return REQUIRED_TRAININGS.map((trainingKey) => {
      return {
        trainingKey,
        ...trainingCoverage(metrics.rows, trainingKey),
      };
    });
  }, [metrics]);

  const expiringSoonCount = metrics ? countExpiringSoon(metrics.rows) : 0;

  const refreshHubState = useCallback(async () => {
    try {
      setStatusState({ kind: "loading", message: "Loading hub state..." });
      const response = await fetch("/api/hub/state", {
        method: "GET",
        headers: {
          "content-type": "application/json",
        },
      });
      const body = (await response.json()) as HubState | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "Failed to load hub state.");
      }

      setHubState(body);
      setStatusState({
        kind: "success",
        message: body.data
          ? "Hub state loaded."
          : "Hub is ready. Push data from your Google Sheets script to begin.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load hub state.";
      setStatusState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void refreshHubState();
  }, [refreshHubState]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1>Training Hub v2</h1>
        <p>
          Rebuilt for hub-first operations. Push records from your Google Sheets script into
          the hub API, then monitor compliance and run status in one place.
        </p>
      </section>

      <section className={styles.panel}>
        <h2>1) Push data into hub (one-time run)</h2>
        <p className={styles.panelHint}>
          POST to <code>/api/hub/push</code> from your Google Apps Script using payload
          <code> {"{ runId, source, employees, records }"} </code>. Reusing the same
          <code>runId</code> is blocked, so each run only executes once.
        </p>

        <div className={styles.inlineActions}>
          <button
            className={styles.primaryButton}
            disabled={statusState.kind === "loading"}
            onClick={() => void refreshHubState()}
          >
            {statusState.kind === "loading" ? "Refreshing..." : "Refresh Hub Status"}
          </button>
        </div>

        {statusState.message ? (
          <p
            className={
              statusState.kind === "error"
                ? styles.statusError
                : statusState.kind === "success"
                  ? styles.statusSuccess
                  : styles.statusInfo
            }
          >
            {statusState.message}
          </p>
        ) : null}

        <ul className={styles.metaList}>
          <li>
            Last run ID: <strong>{hubState?.sync.lastRunId ?? "none"}</strong>
          </li>
          <li>
            Last source: <strong>{hubState?.sync.lastSource ?? "none"}</strong>
          </li>
          <li>
            Last pushed at: <strong>{hubState?.sync.lastPushedAt ?? "never"}</strong>
          </li>
          <li>
            Push count: <strong>{hubState?.sync.pushCount ?? 0}</strong>
          </li>
        </ul>
      </section>

      {hubState?.data && metrics ? (
        <>
          <section className={styles.grid}>
            <article className={styles.metric}>
              <h3>Employees</h3>
              <p>{metrics.totalEmployees}</p>
            </article>
            <article className={styles.metric}>
              <h3>Records</h3>
              <p>{metrics.totalRecords}</p>
            </article>
            <article className={styles.metric}>
              <h3>Overall Compliance</h3>
              <p>{formatPercent(metrics.complianceRate)}</p>
            </article>
            <article className={styles.metric}>
              <h3>Due within {REQUIRED_LOOKBACK_DAYS} days</h3>
              <p>{expiringSoonCount}</p>
            </article>
          </section>

          <section className={styles.panel}>
            <h2>2) Coverage by required training</h2>
            <div className={styles.coverageList}>
              {coverageCards.map((card) => (
                <article className={styles.coverageCard} key={card.trainingKey}>
                  <h3>{PRIMARY_TRAININGS[card.trainingKey]}</h3>
                  <p>{formatPercent(card.rate)}</p>
                  <small>
                    {card.compliantCount}/{card.total} compliant
                  </small>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>3) Detail table</h2>
              <label className={styles.inlineField}>
                <span>Filter</span>
                <select
                  value={trainingFilter}
                  onChange={(event) => setTrainingFilter(event.currentTarget.value as TrainingFilter)}
                >
                  <option value="all">All rows</option>
                  <option value="due-soon">Due soon</option>
                  <option value="overdue">Overdue</option>
                  {REQUIRED_TRAININGS.map((trainingKey) => (
                    <option key={trainingKey} value={trainingKey}>
                      {PRIMARY_TRAININGS[trainingKey]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.rowKey}>
                      <td>{row.employeeName}</td>
                      <td>{row.division ?? "Unassigned"}</td>
                      <td>{PRIMARY_TRAININGS[row.trainingKey]}</td>
                      <td>{dueStatusLabel(row)}</td>
                      <td>{formatDate(row.completedAt)}</td>
                      <td>{formatDate(row.expiresAt)}</td>
                      <td>{row.source ?? "manual"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {hubState.summary?.warnings.length ? (
            <section className={styles.panel}>
              <h2>Import warnings</h2>
              <ul className={styles.warningList}>
                {hubState.summary.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
