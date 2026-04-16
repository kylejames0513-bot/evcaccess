"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { GENERAL_HR_AUTH_EMAIL } from "@/lib/auth/general-hr";
import { supabaseCookieSecureFromHeaders } from "@/lib/supabase/cookie-secure";
import { getSupabaseAnonKeyForServerAuth, getSupabaseUrlForServerAuth } from "@/lib/supabase/public-config";

export type HrLoginState = { error: string } | null;

/**
 * Password login via Server Action so Supabase can set session cookies through
 * `cookies().set` on the same response. Client `fetch` to a Route Handler often
 * fails to persist auth cookies across navigations in production.
 */
export async function hrPasswordLoginAction(_prev: HrLoginState, formData: FormData): Promise<HrLoginState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const url = getSupabaseUrlForServerAuth();
  const anonKey = getSupabaseAnonKeyForServerAuth();
  if (!url || !anonKey) {
    return { error: "Server misconfigured: missing Supabase URL or anon key." };
  }

  const cookieStore = await cookies();
  const secure = await supabaseCookieSecureFromHeaders();

  const supabase = createServerClient<Database>(url, anonKey, {
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
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: GENERAL_HR_AUTH_EMAIL,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}
