// ============================================================
// Public sign-in form resolver.
// ============================================================
// Used by both the legacy Training Records xlsx tab (cutover Stage 5)
// and by the new public sign-in page (target feature 7.2). The shape
// is intentionally permissive: a name string + a training name + a
// completion date + optional pass/fail.
//
// Sign-in is the lowest-trust source. Anything that doesn't match
// goes to unresolved_people for HR review.
// ============================================================

import { matchTraining } from "./training-match";
import { parseName, resolveEmployee } from "./name-match";
import { parseDate } from "./date-parse";
import { emptyBatch, type ResolvedBatch, type ResolvedCompletion } from "./types";

export interface SigninRow {
  attendeeName: string;
  trainingSession: string;
  dateOfTraining?: string | number | Date | null;
  passFail?: string | null;
  reviewedBy?: string | null;
  notes?: string | null;
}

export async function resolveSigninBatch(rows: SigninRow[]): Promise<ResolvedBatch> {
  const batch = emptyBatch("signin");
  batch.rows_in = rows.length;

  const unknownAggregator = new Map<string, { occurrences: number; sample: SigninRow }>();

  for (const row of rows) {
    if (!row.attendeeName || !row.trainingSession) {
      batch.rows_skipped_estimate += 1;
      continue;
    }

    const trainingOutcome = await matchTraining("signin", row.trainingSession);
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

    const parsed = parseName(row.attendeeName);
    const resolution = await resolveEmployee({
      fullName: row.attendeeName,
      lastName: parsed?.last ?? null,
      firstName: parsed?.first ?? null,
    });

    if (!resolution.ok) {
      batch.unresolved_people.push({
        source: "signin",
        raw_payload: row as unknown as Record<string, unknown>,
        last_name: parsed?.last ?? null,
        first_name: parsed?.first ?? null,
        full_name: row.attendeeName,
        paylocity_id: null,
        reason: resolution.failure.reason === "invalid_id" ? "invalid_id" : resolution.failure.reason,
      });
      continue;
    }

    const completionDate = parseDate(row.dateOfTraining ?? null);
    if (!completionDate) {
      batch.unresolved_people.push({
        source: "signin",
        raw_payload: row as unknown as Record<string, unknown>,
        last_name: parsed?.last ?? null,
        first_name: parsed?.first ?? null,
        full_name: row.attendeeName,
        paylocity_id: null,
        reason: "no_match",
      });
      continue;
    }

    const completion: ResolvedCompletion = {
      employee_id: resolution.employee.id,
      training_type_id: trainingOutcome.trainingType.id,
      completion_date: completionDate,
      expiration_date: null,
      source: "signin",
      pass_fail: row.passFail ?? null,
      reviewed_by: row.reviewedBy ?? null,
      notes: row.notes ?? null,
    };
    batch.completions.push(completion);
    batch.rows_added_estimate += 1;
  }

  for (const [, { occurrences, sample }] of unknownAggregator) {
    batch.unknown_trainings.push({
      source: "signin",
      raw_name: sample.trainingSession,
      raw_payload: sample as unknown as Record<string, unknown>,
      occurrence_count: occurrences,
    });
  }

  return batch;
}
