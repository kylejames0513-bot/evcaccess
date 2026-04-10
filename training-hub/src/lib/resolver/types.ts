// ============================================================
// Shared types for the resolver pipeline.
// ============================================================
// Each per-source parser returns a ResolvedBatch which the top-level
// resolver entry point converts into the JSONB preview_payload that
// gets stored on the imports row and later passed to the commit_import
// RPC.
// ============================================================

import type {
  ImportSource,
  Json,
  TrainingRecordInsert,
  ExcusalInsert,
} from "@/types/database";

export interface ResolvedCompletion extends TrainingRecordInsert {
  // No extra fields; this is just an alias so the resolver layer can
  // evolve the shape later without touching every parser.
}

export interface ResolvedExcusal extends ExcusalInsert {
  // Same.
}

export interface ResolvedUnresolvedPerson {
  source: ImportSource;
  raw_payload: Json;
  last_name: string | null;
  first_name: string | null;
  full_name: string | null;
  paylocity_id: string | null;
  reason: "no_match" | "ambiguous" | "invalid_id" | "name_collision" | "special_status" | "name_map_no_match";
}

export interface ResolvedUnknownTraining {
  source: ImportSource;
  raw_name: string;
  raw_payload: Json;
  occurrence_count: number;
}

export interface ResolvedBatch {
  source: ImportSource;
  rows_in: number;
  completions: ResolvedCompletion[];
  excusals: ResolvedExcusal[];
  unresolved_people: ResolvedUnresolvedPerson[];
  unknown_trainings: ResolvedUnknownTraining[];
  // Diagnostic stats for the imports row + UI preview
  rows_added_estimate: number;     // completions count
  rows_skipped_estimate: number;   // rows we deliberately dropped (non_training)
  rehired_count: number;           // orphan profiles reactivated during this batch
}

export function emptyBatch(source: ImportSource): ResolvedBatch {
  return {
    source,
    rows_in: 0,
    completions: [],
    excusals: [],
    unresolved_people: [],
    unknown_trainings: [],
    rows_added_estimate: 0,
    rows_skipped_estimate: 0,
    rehired_count: 0,
  };
}

/**
 * Convert a batch into the JSONB shape expected by commit_import.
 * The RPC reads payload->'completions', payload->'excusals',
 * payload->'unresolved_people', payload->'unknown_trainings'.
 */
export function batchToPayload(batch: ResolvedBatch): Json {
  return {
    completions: batch.completions as unknown as Json,
    excusals: batch.excusals as unknown as Json,
    unresolved_people: batch.unresolved_people as unknown as Json,
    unknown_trainings: batch.unknown_trainings as unknown as Json,
  };
}
