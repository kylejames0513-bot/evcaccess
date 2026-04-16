import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getSupabasePublicAnonKey, getSupabasePublicUrl } from "@/lib/supabase/public-config";

export function createSupabaseBrowserClient() {
  const url = getSupabasePublicUrl();
  const anon = getSupabasePublicAnonKey();
  if (!url || !anon) {
    throw new Error(
      "Missing Supabase URL or anon key. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL + SUPABASE_ANON_KEY from Vercel)."
    );
  }
  return createBrowserClient<Database>(url, anon);
}
