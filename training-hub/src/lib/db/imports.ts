// ============================================================
// imports table data access. Server-only.
// ============================================================
// CRUD for the run log plus the commit_import RPC wrapper that flips
// a previewed import into committed and writes its preview_payload to
// the canonical tables in one transaction.
//
// Lifecycle:
//   1. createPreview() - resolver builds the payload, drops a row at
//                        status='preview'
//   2. getPreview()    - the imports UI reads it back to render the diff
//   3. commitPreview() - calls the commit_import RPC, flips the row
//   4. failImport()    - on errors during commit, set status='failed'
//                        with error text
// ============================================================

import { createServerClient, type DbClient } from "@/lib/supabase";
import type { ImportRow, ImportInsert, ImportUpdate, Json, ImportSource } from "@/types/database";

function db(): DbClient {
  return createServerClient();
}

export interface CreatePreviewInput {
  source: ImportSource;
  filename?: string;
  uploaded_by?: string;
  preview_payload: Json;
  rows_in: number;
  rows_added?: number;
  rows_updated?: number;
  rows_skipped?: number;
  rows_unresolved?: number;
  rows_unknown?: number;
}

export async function createPreview(input: CreatePreviewInput): Promise<ImportRow> {
  const row: ImportInsert = {
    source: input.source,
    filename: input.filename ?? null,
    uploaded_by: input.uploaded_by ?? null,
    status: "preview",
    preview_payload: input.preview_payload,
    rows_in: input.rows_in,
    rows_added: input.rows_added ?? null,
    rows_updated: input.rows_updated ?? null,
    rows_skipped: input.rows_skipped ?? null,
    rows_unresolved: input.rows_unresolved ?? null,
    rows_unknown: input.rows_unknown ?? null,
  };
  const { data, error } = await db().from("imports").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function getImport(id: string): Promise<ImportRow | null> {
  const { data, error } = await db()
    .from("imports")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface ListImportsOptions {
  status?: ImportRow["status"];
  source?: ImportSource;
  limit?: number;
}

export async function listImports(opts: ListImportsOptions = {}): Promise<ImportRow[]> {
  let query = db().from("imports").select("*");
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.source) query = query.eq("source", opts.source);
  query = query.order("started_at", { ascending: false });
  if (opts.limit != null) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Commit a previewed import. Wraps the commit_import RPC, which writes
 * completions, excusals, unresolved_people, unknown_trainings, and flips
 * imports.status='committed' inside a single transaction.
 */
export async function commitPreview(importId: string): Promise<ImportRow> {
  const { error } = await db().rpc("commit_import" as never, { import_id: importId } as never);
  if (error) throw error;
  const updated = await getImport(importId);
  if (!updated) {
    throw new Error(`commitPreview: import ${importId} not found after commit`);
  }
  return updated;
}

/**
 * Mark a preview row as failed. Used when the commit RPC throws or when
 * the resolver itself crashes during preview. Stamps finished_at and the
 * error message so the run log shows what happened.
 */
export async function failImport(importId: string, errorText: string): Promise<ImportRow> {
  const patch: ImportUpdate = {
    status: "failed",
    finished_at: new Date().toISOString(),
    error: errorText.slice(0, 4000),
  };
  const { data, error } = await db()
    .from("imports")
    .update(patch)
    .eq("id", importId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deletePreview(importId: string): Promise<void> {
  // Only previews can be deleted; committed imports stay forever as audit log.
  const current = await getImport(importId);
  if (!current) return;
  if (current.status !== "preview") {
    throw new Error(`deletePreview: import ${importId} is in status ${current.status}, only previews can be deleted`);
  }
  const { error } = await db().from("imports").delete().eq("id", importId);
  if (error) throw error;
}
