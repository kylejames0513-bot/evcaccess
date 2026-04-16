import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { getSupabasePublicAnonKey, getSupabasePublicUrl } from "@/lib/supabase/public-config";

function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextPath = safeNextPath(searchParams.get("next"));
  const url = getSupabasePublicUrl();
  const anonKey = getSupabasePublicAnonKey();

  if (!code || !url || !anonKey) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const redirectTarget = new URL(nextPath, origin);
  const response = NextResponse.redirect(redirectTarget);

  const supabase = createServerClient<Database>(url, anonKey, {
    cookieOptions: {
      secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  return response;
}
