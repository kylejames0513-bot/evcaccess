"use client";

import { useMemo, useState } from "react";
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
import type {
  ImportPayload,
  ImportResponse,
  TrainingFilter,
} from "@/lib/training/types";

type ImportState = {
  kind: "idle" | "loading" | "success" | "error";
  message?: string;
};

async function readFileText(file: File): Promise<string> {
  return await file.text();
}

export function TrainingHubApp() {
  const [employeesCsvFile, setEmployeesCsvFile] = useState<File | null>(null);
  const [recordsCsvFile, setRecordsCsvFile] = useState<File | null>(null);
  const [trainingFilter, setTrainingFilter] = useState<TrainingFilter>("all");
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" });
  const [imported, setImported] = useState<ImportResponse | null>(null);

  const metrics = useMemo(() => {
    if (!imported) {
      return null;
    }

    return analyzeRecords(imported.data.employees, imported.data.records);
  }, [imported]);

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

  const canImport = Boolean(employeesCsvFile && recordsCsvFile);

  async function onImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!employeesCsvFile || !recordsCsvFile) {
      setImportState({
        kind: "error",
        message: "Select both employee and training record CSV files.",
      });
      return;
    }

    try {
      setImportState({ kind: "loading" });
      const [employeesCsv, recordsCsv] = await Promise.all([
        readFileText(employeesCsvFile),
        readFileText(recordsCsvFile),
      ]);

      const payload: ImportPayload = { employeesCsv, recordsCsv };
      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as ImportResponse | { error: string };

      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "Import failed.");
      }

      setImported(body);
      setImportState({
        kind: "success",
        message: body.summary.warningCount
          ? `Imported with ${body.summary.warningCount} warning(s).`
          : "Import complete with no warnings.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error.";
      setImportState({ kind: "error", message });
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1>Training Hub v2</h1>
        <p>
          Rebuilt to support a spreadsheet-first workflow. Export CSVs from Google Sheets
          or Excel, import them here, and instantly review compliance.
        </p>
      </section>

      <section className={styles.panel}>
        <h2>1) Import data</h2>
        <p className={styles.panelHint}>
          Employees CSV columns: <code>employee_id,name,division,location,status</code>.
          Records CSV columns:{" "}
          <code>employee_id,training_key,completed_at,expires_at,source</code>.
        </p>
        <form className={styles.importForm} onSubmit={onImportSubmit}>
          <label className={styles.field}>
            <span>Employees export (.csv)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setEmployeesCsvFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>

          <label className={styles.field}>
            <span>Training records export (.csv)</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setRecordsCsvFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>

          <button className={styles.primaryButton} disabled={!canImport || importState.kind === "loading"}>
            {importState.kind === "loading" ? "Importing..." : "Import and Analyze"}
          </button>
        </form>

        {importState.message ? (
          <p
            className={
              importState.kind === "error"
                ? styles.statusError
                : importState.kind === "success"
                  ? styles.statusSuccess
                  : styles.statusInfo
            }
          >
            {importState.message}
          </p>
        ) : null}
      </section>

      {imported && metrics ? (
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

          {imported.summary.warnings.length ? (
            <section className={styles.panel}>
              <h2>Import warnings</h2>
              <ul className={styles.warningList}>
                {imported.summary.warnings.map((warning) => (
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
