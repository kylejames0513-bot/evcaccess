import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type DbClient = SupabaseClient<Database>;

// Lazy module-level singleton for the browser client. We construct on
// first access instead of at module load so that test files (and the
// Next build step) can import db helpers without exploding when the env
// vars are not set in their context.
let browserClient: DbClient | null = null;

export function getBrowserClient(): DbClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "supabase: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required to construct the browser client"
      );
    }
    browserClient = createClient<Database>(url, key);
  }
  return browserClient;
}

// Backwards-compatible accessor for older code that imports `supabase`
// directly. Kept as a getter so the construction stays lazy.
export const supabase: DbClient = new Proxy({} as DbClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getBrowserClient() as unknown as object, prop, receiver);
  },
});

// Server client. Service role key. Bypasses RLS. Use ONLY in API routes,
// server actions, or server-only modules under lib/db/. Never import into
// a "use client" file.
export function createServerClient(): DbClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "createServerClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }
  return createClient<Database>(url, key);
}
