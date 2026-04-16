/**
 * Ingestion run logger — writes to ingestion_runs and audit_log.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RunStats = {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  unresolved: number;
  errors: string[];
};

export async function createIngestionRun(
  supabase: SupabaseClient,
  source: string,
  triggeredBy: string = "manual"
): Promise<string> {
  const { data, error } = await supabase
    .from("ingestion_runs")
    .insert({
      source,
      status: "running",
      triggered_by: triggeredBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create ingestion run: ${error?.message}`);
  }
  return data.id;
}

export async function finishIngestionRun(
  supabase: SupabaseClient,
  runId: string,
  stats: RunStats
): Promise<void> {
  const status =
    stats.errors.length > 0
      ? "failed"
      : stats.unresolved > 0
        ? "partial"
        : "success";

  await supabase
    .from("ingestion_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      rows_processed: stats.processed,
      rows_inserted: stats.inserted,
      rows_updated: stats.updated,
      rows_skipped: stats.skipped,
      rows_unresolved: stats.unresolved,
      error_summary: stats.errors.length > 0 ? stats.errors.join("\n").slice(0, 2000) : null,
    })
    .eq("id", runId);
}

export async function writeAuditEntry(
  supabase: SupabaseClient,
  entry: {
    actor: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    source?: string;
  }
): Promise<void> {
  await supabase.from("audit_log").insert({
    actor: entry.actor,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    source: entry.source ?? null,
  });
}

export async function addToReviewQueue(
  supabase: SupabaseClient,
  entry: {
    ingestion_run_id: string;
    source: string;
    reason: string;
    raw_payload: Record<string, unknown>;
    suggested_match_employee_id?: string;
    suggested_match_score?: number;
  }
): Promise<void> {
  await supabase.from("review_queue").insert({
    ingestion_run_id: entry.ingestion_run_id,
    source: entry.source,
    reason: entry.reason,
    raw_payload: entry.raw_payload,
    suggested_match_employee_id: entry.suggested_match_employee_id ?? null,
    suggested_match_score: entry.suggested_match_score ?? null,
  });
}
