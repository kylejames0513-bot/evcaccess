import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabasePublicUrl } from "@/lib/supabase/public-config";

export function createSupabaseServiceRoleClient() {
  const url = getSupabasePublicUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
