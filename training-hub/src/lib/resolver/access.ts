// ============================================================
// Access matrix resolver.
// ============================================================
// Input shape (per docs/inventory/11_import_formats.md):
//   Wide matrix. Per-row: L NAME, F NAME, ACTIVE, then 34 training
//   columns whose names match training_types.column_key. Each cell is
//   either a date (a completion), an empty string (skip), or a
//   non-date string like 'NA' or 'FACILITIES' (an excusal reason).
//
// Pivot wide -> long: each non-empty cell becomes either one
// completion or one excusal in the resolved batch.
// ============================================================

import { matchTraining } from "./training-match";
import { parseName, resolveEmployee } from "./name-match";
import { parseDate } from "./date-parse";
import {
  emptyBatch,
  type ResolvedBatch,
  type ResolvedCompletion,
  type ResolvedExcusal,
} from "./types";

export interface AccessRow {
  "L NAME"?: string | null;
  "F NAME"?: string | null;
  ACTIVE?: string | null;
  // Plus an arbitrary number of training column_key columns.
  [trainingColumnKey: string]: string | number | Date | null | undefined;
}

const NON_TRAINING_COLUMNS = new Set(["L NAME", "F NAME", "ACTIVE"]);

export async function resolveAccessBatch(rows: AccessRow[]): Promise<ResolvedBatch> {
  const batch = emptyBatch("access");
  batch.rows_in = rows.length;

  const unknownAggregator = new Map<string, { occurrences: number; sample: AccessRow }>();

  for (const row of rows) {
    const lastName = String(row["L NAME"] ?? "").trim();
    const firstName = String(row["F NAME"] ?? "").trim();
    if (!lastName || !firstName) {
      batch.rows_skipped_estimate += 1;
      continue;
    }

    // Match the employee once per row, then walk every training column.
    const resolution = await resolveEmployee({ lastName, firstName });
    if (!resolution.ok) {
      const suggestion =
        resolution.failure.reason === "ambiguous" ? resolution.failure.suggestion?.id ?? null : null;
      batch.unresolved_people.push({
        source: "access",
        raw_payload: row as unknown as Record<string, unknown>,
        last_name: lastName,
        first_name: firstName,
        full_name: `${lastName}, ${firstName}`,
        paylocity_id: null,
        reason: resolution.failure.reason === "invalid_id" ? "invalid_id" : resolution.failure.reason,
        suggested_employee_id: suggestion,
      });
      continue;
    }

    const employeeId = resolution.employee.id;

    for (const [columnKey, cell] of Object.entries(row)) {
      if (NON_TRAINING_COLUMNS.has(columnKey)) continue;
      if (cell == null) continue;

      const cellStr = typeof cell === "string" ? cell.trim() : cell;
      if (typeof cellStr === "string" && cellStr.length === 0) continue;

      // Try to parse the cell as a date first.
      const completionDate = parseDate(cell as string | number | Date);
      if (completionDate) {
        const trainingOutcome = await matchTraining("access", columnKey);
        if (trainingOutcome.kind === "skip") {
          batch.rows_skipped_estimate += 1;
          continue;
        }
        if (trainingOutcome.kind === "unknown") {
          const key = trainingOutcome.rawName.toLowerCase();
          const existing = unknownAggregator.get(key);
          if (existing) existing.occurrences += 1;
          else unknownAggregator.set(key, { occurrences: 1, sample: row });
          continue;
        }
        const completion: ResolvedCompletion = {
          employee_id: employeeId,
          training_type_id: trainingOutcome.trainingType.id,
          completion_date: completionDate,
          expiration_date: null,
          source: "access",
        };
        batch.completions.push(completion);
        batch.rows_added_estimate += 1;
        continue;
      }

      // Non-date string -> excusal.
      if (typeof cellStr === "string" && cellStr.length > 0) {
        const trainingOutcome = await matchTraining("access", columnKey);
        if (trainingOutcome.kind !== "matched") {
          batch.rows_skipped_estimate += 1;
          continue;
        }
        const excusal: ResolvedExcusal = {
          employee_id: employeeId,
          training_type_id: trainingOutcome.trainingType.id,
          reason: cellStr,
          source: "access",
        };
        batch.excusals.push(excusal);
      }
    }
  }

  for (const [, { occurrences, sample }] of unknownAggregator) {
    batch.unknown_trainings.push({
      source: "access",
      raw_name: "(access wide column)",
      raw_payload: sample as unknown as Record<string, unknown>,
      occurrence_count: occurrences,
    });
  }

  return batch;
}
