// ============================================================
// Paylocity CSV resolver.
// ============================================================
// Input shape (per docs/inventory/11_import_formats.md):
//   25 columns. Key fields:
//     Employee Id, Last Name, First Name, Preferred/First Name,
//     Department Description, Position Title,
//     Skill, Code, Effective/Issue Date, Expiration Date,
//     Record Type
//
// Behavior:
//   - Match by Employee Id (canonical Paylocity ID).
//   - If no DB match, look for an orphaned former-employee row by
//     name and reactivate it via the rehire helper.
//   - Skill+Code translates through the alias dictionary.
//   - Skip rows that are not training records (DL, MVR, Insurance,
//     Background, Vehicle Insurance Declination Page).
//   - Rows with an unknown Skill/Code go to unknown_trainings.
//   - Rows whose person can't be matched (and no rehire candidate)
//     go to unresolved_people.
// ============================================================

import { reactivateEmployee } from "@/lib/db/employees";
import { matchTraining, paylocityRawName } from "./training-match";
import { resolveEmployee } from "./name-match";
import { findRehireCandidate } from "./rehire";
import { parseDate } from "./date-parse";
import { emptyBatch, type ResolvedBatch, type ResolvedCompletion } from "./types";

export interface PaylocityRow {
  "Employee Id"?: string | null;
  "Last Name"?: string | null;
  "First Name"?: string | null;
  "Preferred/First Name"?: string | null;
  "Department Description"?: string | null;
  "Position Title"?: string | null;
  Skill?: string | null;
  Code?: string | null;
  "Effective/Issue Date"?: string | number | Date | null;
  "Expiration Date"?: string | number | Date | null;
  "Record Type"?: string | null;
}

export async function resolvePaylocityBatch(rows: PaylocityRow[]): Promise<ResolvedBatch> {
  const batch = emptyBatch("paylocity");
  batch.rows_in = rows.length;

  // Aggregate unknowns by raw_name to avoid spamming the queue with one
  // row per occurrence.
  const unknownAggregator = new Map<string, { occurrences: number; sample: PaylocityRow }>();

  for (const row of rows) {
    const paylocityId = (row["Employee Id"] ?? "").trim();
    const lastName = (row["Last Name"] ?? "").trim();
    const firstName = (row["First Name"] ?? "").trim();
    const rawTraining = paylocityRawName(row.Skill, row.Code);

    // 1. Match the training first; some rows we skip outright before
    //    even bothering with employee resolution.
    const trainingOutcome = await matchTraining("paylocity", rawTraining);
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

    // 2. Match the person.
    let resolution = await resolveEmployee({
      paylocityId,
      lastName,
      firstName,
    });

    // 2a. If paylocity_id was given but unknown, try a rehire match
    //     before giving up.
    if (!resolution.ok && resolution.failure.reason === "invalid_id" && lastName && firstName) {
      const rehire = await findRehireCandidate({ paylocityId, lastName, firstName });
      if (rehire) {
        await reactivateEmployee(rehire.orphan.id, rehire.newPaylocityId);
        batch.rehired_count += 1;
        resolution = {
          ok: true,
          employee: { ...rehire.orphan, paylocity_id: rehire.newPaylocityId, is_active: true },
          matchedBy: "paylocity_id",
        };
      }
    }

    if (!resolution.ok) {
      const suggestion =
        resolution.failure.reason === "ambiguous" ? resolution.failure.suggestion?.id ?? null : null;
      batch.unresolved_people.push({
        source: "paylocity",
        raw_payload: row as unknown as import("@/types/database").Json,
        last_name: lastName || null,
        first_name: firstName || null,
        full_name: lastName && firstName ? `${lastName}, ${firstName}` : null,
        paylocity_id: paylocityId || null,
        reason: resolution.failure.reason === "invalid_id" ? "invalid_id" : resolution.failure.reason,
        suggested_employee_id: suggestion,
      });
      continue;
    }

    // 3. Build the completion.
    const completionDate = parseDate(row["Effective/Issue Date"] ?? null);
    if (!completionDate) {
      // No usable date is a special kind of unresolved.
      batch.unresolved_people.push({
        source: "paylocity",
        raw_payload: row as unknown as import("@/types/database").Json,
        last_name: lastName || null,
        first_name: firstName || null,
        full_name: lastName && firstName ? `${lastName}, ${firstName}` : null,
        paylocity_id: paylocityId || null,
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
      source: "paylocity",
    };
    batch.completions.push(completion);
    batch.rows_added_estimate += 1;
  }

  // Flush the unknown aggregator into the batch.
  for (const [, { occurrences, sample }] of unknownAggregator) {
    batch.unknown_trainings.push({
      source: "paylocity",
      raw_name: paylocityRawName(sample.Skill, sample.Code),
      raw_payload: sample as unknown as import("@/types/database").Json,
      occurrence_count: occurrences,
    });
  }

  return batch;
}
