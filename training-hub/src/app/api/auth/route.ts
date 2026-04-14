import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { email, password } = body;
  const legacyPassword = process.env.HR_PASSWORD?.trim();

  // Support legacy password-only login during transition
  if (!email && password) {
    if (!legacyPassword) {
      throw new ApiError("Shared password login is disabled", 403, "forbidden");
    }
    if (password === legacyPassword) {
      const cookieStore = await cookies();
      cookieStore.set("hr_session", "authenticated", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
        path: "/",
      });
      return { success: true, mode: "legacy" };
    }
    throw new ApiError("Incorrect password", 401, "unauthorized");
  }

  // Supabase Auth: email + password
  if (email && password) {
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw new ApiError(error.message, 401, "unauthorized");
    }

    // Set session cookie with the access token
    const cookieStore = await cookies();
    cookieStore.set("hr_session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    if (data.session) {
      cookieStore.set("sb_access_token", data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
        path: "/",
      });
      cookieStore.set("sb_refresh_token", data.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
    }

    return {
      success: true,
      mode: "supabase",
      user: { email: data.user?.email, role: data.user?.user_metadata?.role },
    };
  }

  throw new ApiError("Email and password required", 400, "missing_field");
});

export const GET = withApiHandler(async () => {
  const cookieStore = await cookies();
  const session = cookieStore.get("hr_session");
  const sbToken = cookieStore.get("sb_access_token");

  return {
    authenticated: session?.value === "authenticated",
    hasSupabaseSession: !!sbToken?.value,
    legacyLoginEnabled: Boolean(process.env.HR_PASSWORD?.trim()),
  };
});

export const DELETE = withApiHandler(async () => {
  const cookieStore = await cookies();
  cookieStore.delete("hr_session");
  cookieStore.delete("sb_access_token");
  cookieStore.delete("sb_refresh_token");
  return { success: true };
});
