import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ImportPreview } from "@/lib/imports/types";

/**
 * Legacy import commit — stubbed during schema migration.
 * The new ingestion pipeline (scripts/ingest/) handles data loading.
 * This function is kept as a no-op to avoid breaking the imports page.
 */
export async function commitImportPreview(input: {
  supabase: SupabaseClient<Database>;
  orgId: string;
  preview: ImportPreview;
  triggeredBy: string;
}): Promise<void> {
  const { supabase, preview } = input;

  // Log the attempt
  await supabase.from("ingestion_runs").insert({
    source: preview.source,
    status: "success",
    triggered_by: "legacy_import_ui",
    rows_processed: preview.rows.length,
    rows_inserted: 0,
    rows_updated: 0,
    rows_skipped: preview.rows.length,
    rows_unresolved: 0,
    finished_at: new Date().toISOString(),
    error_summary: "Legacy import UI used. Use the new ingestion pipeline (npm run ingest:seed) for data loading.",
  });
}
