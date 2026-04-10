import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type DbClient = SupabaseClient<Database>;

// Browser client. Anon key only. Use for client components / pages.
export const supabase: DbClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Server client. Service role key. Bypasses RLS. Use ONLY in API routes,
// server actions, or server-only modules under lib/db/. Never import into
// a "use client" file.
export function createServerClient(): DbClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
