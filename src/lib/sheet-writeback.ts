import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Outbound writeback to the Google Sheet via the Apps Script HubWriteback
 * web app. All writeback flows through one POST; the script routes on
 * `action` in the JSON body.
 *
 * Failures are stored in `sync_failures` so the operator can retry from
 * the /ingestion health panel. The caller's main operation (Supabase write)
 * is never blocked by a sync failure.
 */

const TIMEOUT_MS = 8000;

export type WritebackAction =
  | "employee_upsert"
  | "completion_upsert"
  | "session_upsert"
  | "session_delete";

export async function postWriteback(
  action: WritebackAction,
  payload: Record<string, unknown>,
  opts: { supabase: SupabaseClient; actor?: string } = {} as {
    supabase: SupabaseClient;
    actor?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const url = resolveUrl();
  if (!url) {
    // No endpoint configured — log quietly. This is expected in dev.
    return { ok: false, error: "writeback url not configured" };
  }

  const body = JSON.stringify({ action, payload });

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await logFailure(opts.supabase, action, payload, `${res.status}: ${text.slice(0, 400)}`);
      return { ok: false, error: `http ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logFailure(opts.supabase, action, payload, msg);
    return { ok: false, error: msg };
  }
}

function resolveUrl(): string | null {
  return (
    process.env.GOOGLE_APPS_SCRIPT_WRITEBACK_URL ??
    process.env.GOOGLE_APPS_SCRIPT_URL ??
    null
  );
}

async function logFailure(
  supabase: SupabaseClient,
  action: string,
  payload: Record<string, unknown>,
  error: string,
): Promise<void> {
  try {
    await supabase.from("sync_failures").insert({
      kind: action,
      target: "google_sheet",
      payload,
      error,
    });
  } catch {
    // never throw from the failure logger
  }
}
