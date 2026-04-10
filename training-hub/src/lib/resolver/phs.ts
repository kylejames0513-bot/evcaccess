// ============================================================
// PHS CSV resolver.
// ============================================================
// Input shape (per docs/inventory/11_import_formats.md):
//   7 real columns: Employee Name, Upload Category, Upload Type,
//   Effective Date, Expiration Date, Termination Date, View File.
//
// Behavior:
//   - PHS has no employee ID. Match by Employee Name (Last, First)
//     against last_name + first_name + aliases array.
//   - Upload Category + Upload Type form the training identifier.
//     Med Admin No Show / Med Admin Fail are NOT completions; they
//     drop into unresolved_people with reason='special_status'.
//   - Drivers License rows are skipped wholesale.
// ============================================================

import { matchTraining, phsRawName } from "./training-match";
import { parseName, resolveEmployee } from "./name-match";
import { parseDate } from "./date-parse";
import { emptyBatch, type ResolvedBatch, type ResolvedCompletion } from "./types";

export interface PhsRow {
  "Employee Name"?: string | null;
  "Upload Category"?: string | null;
  "Upload Type"?: string | null;
  "Effective Date"?: string | number | Date | null;
  "Expiration Date"?: string | number | Date | null;
  "Termination Date"?: string | number | Date | null;
  "View File"?: string | null;
}

export async function resolvePhsBatch(rows: PhsRow[]): Promise<ResolvedBatch> {
  const batch = emptyBatch("phs");
  batch.rows_in = rows.length;

  const unknownAggregator = new Map<string, { occurrences: number; sample: PhsRow }>();

  for (const row of rows) {
    // 1. PHS-specific training name handling.
    const trainingDecision = phsRawName(row["Upload Category"], row["Upload Type"]);

    // Special status pairs: not completions.
    if (trainingDecision && "specialStatus" in trainingDecision) {
      const parsed = parseName(row["Employee Name"] ?? "");
      batch.unresolved_people.push({
        source: "phs",
        raw_payload: row as unknown as Record<string, unknown>,
        last_name: parsed?.last ?? null,
        first_name: parsed?.first ?? null,
        full_name: row["Employee Name"] ?? null,
        paylocity_id: null,
        reason: "special_status",
      });
      continue;
    }

    if (!trainingDecision) {
      batch.rows_skipped_estimate += 1;
      continue;
    }

    const trainingOutcome = await matchTraining("phs", trainingDecision.name);
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

    // 2. Match the person by name.
    const fullName = (row["Employee Name"] ?? "").trim();
    const parsed = parseName(fullName);
    const resolution = await resolveEmployee({
      fullName,
      lastName: parsed?.last ?? null,
      firstName: parsed?.first ?? null,
    });

    if (!resolution.ok) {
      batch.unresolved_people.push({
        source: "phs",
        raw_payload: row as unknown as Record<string, unknown>,
        last_name: parsed?.last ?? null,
        first_name: parsed?.first ?? null,
        full_name: fullName || null,
        paylocity_id: null,
        reason: resolution.failure.reason === "invalid_id" ? "invalid_id" : resolution.failure.reason,
      });
      continue;
    }

    // 3. Build the completion.
    const completionDate = parseDate(row["Effective Date"] ?? null);
    if (!completionDate) {
      batch.unresolved_people.push({
        source: "phs",
        raw_payload: row as unknown as Record<string, unknown>,
        last_name: parsed?.last ?? null,
        first_name: parsed?.first ?? null,
        full_name: fullName || null,
        paylocity_id: null,
        reason: "no_match",
      });
      continue;
    }
    const expirationDate = parseDate(row["Expiration Date"] ?? null);

    const completion: ResolvedCompletion = {
      employee_id: resolution.employee.id,
      training_type_id: trainingOutcome.trainingType.id,
      completion_date: completionDate,
      expiration_date: expirationDate ?? null,
      source: "phs",
    };
    batch.completions.push(completion);
    batch.rows_added_estimate += 1;
  }

  for (const [, { occurrences, sample }] of unknownAggregator) {
    const dec = phsRawName(sample["Upload Category"], sample["Upload Type"]);
    batch.unknown_trainings.push({
      source: "phs",
      raw_name: dec && "name" in dec ? dec.name : `${sample["Upload Category"] ?? ""} | ${sample["Upload Type"] ?? ""}`,
      raw_payload: sample as unknown as Record<string, unknown>,
      occurrence_count: occurrences,
    });
  }

  return batch;
}
