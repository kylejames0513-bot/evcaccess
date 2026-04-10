// ============================================================
// Resolver entry point.
// ============================================================
// Top-level facade. Imports use this to:
//   1. Take a parsed source-specific row array
//   2. Run it through the right parser
//   3. Drop a preview into the imports table
//   4. Return the import_id so the UI can navigate to the preview
//
// Each parser is also exported individually for tests and for the
// rare case a caller wants to inspect the resolved batch without
// persisting a preview row.
// ============================================================

import { createPreview } from "@/lib/db/imports";
import type { ImportSource, ImportRow } from "@/types/database";
import { batchToPayload, type ResolvedBatch } from "./types";

export type { ResolvedBatch } from "./types";

export { resolvePaylocityBatch } from "./paylocity";
export { resolvePhsBatch } from "./phs";
export { resolveAccessBatch } from "./access";
export { resolveSigninBatch } from "./signin";

export { parseDate, addYears } from "./date-parse";
export { parseName, normalizeNameComponent, namesEqual, resolveEmployee } from "./name-match";
export { matchTraining, paylocityRawName, phsRawName } from "./training-match";
export { findRehireCandidate } from "./rehire";

import { resolvePaylocityBatch } from "./paylocity";
import { resolvePhsBatch } from "./phs";
import { resolveAccessBatch } from "./access";
import { resolveSigninBatch } from "./signin";
import type { PaylocityRow } from "./paylocity";
import type { PhsRow } from "./phs";
import type { AccessRow } from "./access";
import type { SigninRow } from "./signin";

export interface CreateImportInput {
  source: ImportSource;
  filename?: string;
  uploaded_by?: string;
  rows: PaylocityRow[] | PhsRow[] | AccessRow[] | SigninRow[];
}

export interface CreateImportResult {
  import: ImportRow;
  batch: ResolvedBatch;
}

/**
 * Run the right parser for the given source, persist a preview row in
 * the imports table, and return both the persisted row and the in-memory
 * batch so the caller can render the preview without re-fetching.
 */
export async function createImportPreview(
  input: CreateImportInput
): Promise<CreateImportResult> {
  let batch: ResolvedBatch;
  switch (input.source) {
    case "paylocity":
      batch = await resolvePaylocityBatch(input.rows as PaylocityRow[]);
      break;
    case "phs":
      batch = await resolvePhsBatch(input.rows as PhsRow[]);
      break;
    case "access":
      batch = await resolveAccessBatch(input.rows as AccessRow[]);
      break;
    case "signin":
      batch = await resolveSigninBatch(input.rows as SigninRow[]);
      break;
    default:
      throw new Error(`createImportPreview: unsupported source ${input.source}`);
  }

  const preview = await createPreview({
    source: input.source,
    filename: input.filename,
    uploaded_by: input.uploaded_by,
    preview_payload: batchToPayload(batch),
    rows_in: batch.rows_in,
    rows_added: batch.rows_added_estimate,
    rows_skipped: batch.rows_skipped_estimate,
    rows_unresolved: batch.unresolved_people.length,
    rows_unknown: batch.unknown_trainings.length,
  });

  return { import: preview, batch };
}
