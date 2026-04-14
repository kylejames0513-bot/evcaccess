// ============================================================
// getCurrentHrUser — resolve the signed-in HR user on the server.
// ============================================================
// The app has two login modes (see src/app/api/auth/route.ts):
//
//   1. Legacy shared HR password. Sets only hr_session=authenticated;
//      the request carries no user identity. We treat these sessions
//      as the generic "Human Resources" office so outgoing memos are
//      signed by the department, not a specific person.
//
//   2. Supabase email + password. Sets hr_session=authenticated AND
//      sb_access_token. We resolve the access token against Supabase
//      Auth to find the user, then look up the matching row in the
//      employees table (join on auth_id) to pull their display name
//      and job title for the memo sign-off.
//
// Returns null when nobody is signed in (caller decides whether
// that's a 401 or a generic fallback).
// ============================================================

import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";

export interface CurrentHrUser {
  /** True when the session came from the shared HR password. */
  isLegacy: boolean;
  /** Display name for sign-offs. */
  name: string;
  /** Job title for sign-offs, when available. Null for legacy sessions. */
  title: string | null;
  /** Employee id when a matching employees row was found. */
  employeeId: string | null;
}

const LEGACY_USER: CurrentHrUser = {
  isLegacy: true,
  name: "Human Resources",
  title: null,
  employeeId: null,
};

export async function getCurrentHrUser(): Promise<CurrentHrUser | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("hr_session");
  if (session?.value !== "authenticated") return null;

  const accessToken = cookieStore.get("sb_access_token")?.value;
  if (!accessToken) {
    return LEGACY_USER;
  }

  const db = createServerClient();

  // Validate the access token and pull the Supabase auth user.
  const { data: userData, error: userErr } = await db.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    // Token expired or invalid — fall back to the generic office
    // identity rather than erroring out the memo request.
    return LEGACY_USER;
  }

  // Resolve to the employees row so we can sign with their real
  // name and title instead of the raw email on the auth user.
  // First try the auth_id link; if that isn't set (legacy accounts),
  // fall back to matching on email.
  let emp: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
    position: string | null;
  } | null = null;

  const byAuthId = await db
    .from("employees")
    .select("id, first_name, last_name, job_title, position")
    .eq("auth_id", userData.user.id)
    .maybeSingle();
  emp = byAuthId.data ?? null;

  const authEmail = userData.user.email ?? null;
  if (!emp && authEmail) {
    const byEmail = await db
      .from("employees")
      .select("id, first_name, last_name, job_title, position")
      .ilike("email", authEmail)
      .maybeSingle();
    emp = byEmail.data ?? null;
  }

  if (!emp) {
    // Authenticated Supabase user without a matching employee row.
    // Use whatever the auth user exposes, falling back to the email
    // local-part so the memo still has a human name on it.
    const email = authEmail ?? "";
    const fallbackName = email ? email.split("@")[0] : "Human Resources";
    return {
      isLegacy: false,
      name: fallbackName,
      title: null,
      employeeId: null,
    };
  }

  const name = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() || "Human Resources";
  const title = emp.job_title?.trim() || emp.position?.trim() || null;

  return {
    isLegacy: false,
    name,
    title,
    employeeId: emp.id,
  };
}
