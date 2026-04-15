import { cookies } from "next/headers";
import { ApiError } from "@/lib/api-handler";

/** Shared-password or Supabase login sets `hr_session=authenticated`. */
export async function requireHrCookie(): Promise<void> {
  const c = await cookies();
  if (c.get("hr_session")?.value !== "authenticated") {
    throw new ApiError("HR session required", 401, "unauthorized");
  }
}
