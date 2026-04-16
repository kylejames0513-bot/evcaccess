import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { supabaseCookieSecureFromHeaders } from "@/lib/supabase/cookie-secure";
import { getSupabasePublicAnonKey, getSupabasePublicUrl } from "@/lib/supabase/public-config";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = getSupabasePublicUrl();
  const anon = getSupabasePublicAnonKey();
  if (!url || !anon) {
    throw new Error(
      "Missing Supabase URL or anon key. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL + SUPABASE_ANON_KEY from Vercel)."
    );
  }
  const secure = await supabaseCookieSecureFromHeaders();
  return createServerClient<Database>(url, anon, {
    cookieOptions: {
      secure,
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* ignore when called from a Server Component that cannot set cookies */
        }
      },
    },
  });
}
