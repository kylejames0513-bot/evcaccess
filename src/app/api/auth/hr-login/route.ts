import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { GENERAL_HR_AUTH_EMAIL } from "@/lib/auth/general-hr";
import { supabaseCookieSecureFromRequest } from "@/lib/supabase/cookie-secure";
import { getSupabasePublicAnonKey, getSupabasePublicUrl } from "@/lib/supabase/public-config";

export async function POST(request: NextRequest) {
  let password: string;
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const url = getSupabasePublicUrl();
  const anonKey = getSupabasePublicAnonKey();
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Server misconfigured: missing Supabase URL or anon/publishable key." },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ ok: true as const });
  const supabase = createServerClient<Database>(url, anonKey, {
    cookieOptions: {
      secure: supabaseCookieSecureFromRequest(request),
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, responseHeaders) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        if (responseHeaders && typeof responseHeaders === "object") {
          for (const [key, value] of Object.entries(responseHeaders)) {
            if (typeof value === "string") {
              response.headers.set(key, value);
            }
          }
        }
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: GENERAL_HR_AUTH_EMAIL,
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return response;
}
