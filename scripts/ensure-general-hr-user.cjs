/**
 * Creates or updates the shared HR auth user via Supabase Auth Admin API (supported path).
 * Keeps email in sync with src/lib/auth/general-hr.ts unless GENERAL_HR_AUTH_EMAIL is set.
 */
const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const EMAIL =
  process.env.GENERAL_HR_AUTH_EMAIL?.trim() || "general-hr@training-hub.local";
const PASSWORD = process.env.GENERAL_HR_PASSWORD?.trim() || "tennyson";

const DEFAULT_ORG_NAME = process.env.HR_HUB_DEFAULT_ORG_NAME?.trim() || "Emory Valley Center";
const DEFAULT_ORG_SLUG = process.env.HR_HUB_DEFAULT_ORG_SLUG?.trim() || "evc";

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

/**
 * Ensure a default organization row exists and the HR user's profile is
 * linked to it. Without this, dashboard layout redirects the shared HR
 * user to /onboarding forever.
 */
async function ensureOrgAndProfile(supabase, userId) {
  let { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", DEFAULT_ORG_SLUG)
    .maybeSingle();

  if (!org) {
    const { data: created, error } = await supabase
      .from("organizations")
      .insert({
        name: DEFAULT_ORG_NAME,
        slug: DEFAULT_ORG_SLUG,
        regulator: "TN DIDD",
        fiscal_year_start_month: 7,
      })
      .select("id")
      .single();
    if (error) {
      console.error("Failed to create default organization:", error.message);
      process.exit(1);
    }
    org = created;
    console.log("Created default organization:", DEFAULT_ORG_SLUG);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        org_id: org.id,
        full_name: "General HR",
        role: "admin",
      },
      { onConflict: "id" }
    );
  if (profileError) {
    console.error("Failed to upsert HR profile:", profileError.message);
    process.exit(1);
  }
  console.log("Linked HR user to org:", org.id);
}

async function main() {
  if (!url || !serviceKey) {
    console.error(
      "Missing env: need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Get them from Supabase Dashboard → Settings → API, or `npm run vercel:env:pull`."
    );
    process.exit(1);
  }

  if (PASSWORD.length < 8) {
    console.error("GENERAL_HR_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "General HR" },
  });

  if (!createError) {
    console.log("Created General HR user:", created.user?.id);
    if (created.user?.id) await ensureOrgAndProfile(supabase, created.user.id);
    return;
  }

  const msg = createError.message || "";
  const duplicate =
    createError.code === "email_exists" ||
    /already\s+been\s+registered|already\s+registered|duplicate/i.test(msg);

  if (!duplicate) {
    console.error("Auth admin createUser failed:", createError);
    process.exit(1);
  }

  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });
  if (listError) {
    console.error("listUsers failed:", listError);
    process.exit(1);
  }

  const user = list?.users?.find((u) => (u.email || "").toLowerCase() === EMAIL.toLowerCase());
  if (!user) {
    console.error("Duplicate email error but user not found for:", EMAIL);
    process.exit(1);
  }

  const { error: updError } = await supabase.auth.admin.updateUserById(user.id, {
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "General HR" },
  });
  if (updError) {
    console.error("updateUserById failed:", updError);
    process.exit(1);
  }

  console.log("Updated General HR user:", user.id);
  await ensureOrgAndProfile(supabase, user.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
