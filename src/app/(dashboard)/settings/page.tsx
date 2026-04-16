import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, regulator, fiscal_year_start_month")
    .eq("id", profile.org_id)
    .maybeSingle();

  if (!org) redirect("/onboarding");

  async function updateOrg(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();
    const name = String(formData.get("name") ?? "").trim();
    const regulator = String(formData.get("regulator") ?? "").trim();
    const fiscal = parseInt(String(formData.get("fiscal_year_start_month") ?? "7"), 10);
    const orgId = String(formData.get("org_id") ?? "").trim();

    if (!orgId || !name) return;

    await supabase
      .from("organizations")
      .update({
        name,
        regulator,
        fiscal_year_start_month: Number.isFinite(fiscal) ? fiscal : 7,
      })
      .eq("id", orgId);

    revalidatePath("/settings");
    revalidatePath("/dashboard");
  }

  // Stats
  const { count: empCount } = await supabase.from("employees").select("id", { count: "exact", head: true });
  const { count: trCount } = await supabase.from("trainings").select("id", { count: "exact", head: true }).eq("active", true);
  const { count: compCount } = await supabase.from("completions").select("id", { count: "exact", head: true });
  const { count: sepCount } = await supabase.from("separations").select("id", { count: "exact", head: true });

  return (
    <div className="space-y-8">
      <div>
        <p className="caption">Configuration</p>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
          Settings
        </h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Org settings form */}
        <div className="space-y-4">
          <p className="caption">Organization</p>
          <form action={updateOrg} className="rounded-lg border border-[--rule] bg-[--surface] p-6 space-y-4">
            <input type="hidden" name="org_id" value={org.id} />
            <div className="space-y-1">
              <label className="caption">Name</label>
              <input name="name" defaultValue={org.name} required className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="caption">Slug (read-only)</label>
              <input value={org.slug} readOnly className="w-full rounded-md border border-[--rule] bg-[--surface-alt] px-3 py-2 text-sm text-[--ink-muted] cursor-not-allowed" />
              <p className="text-xs text-[--ink-muted]">Used in kiosk URLs: /signin/{org.slug}</p>
            </div>
            <div className="space-y-1">
              <label className="caption">Regulator</label>
              <input name="regulator" defaultValue={org.regulator} className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm" placeholder="TN DIDD, TennCare, etc." />
            </div>
            <div className="space-y-1">
              <label className="caption">Fiscal year start month</label>
              <select name="fiscal_year_start_month" defaultValue={org.fiscal_year_start_month} className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90">
              Save changes
            </button>
          </form>
        </div>

        {/* Database stats + links */}
        <div className="space-y-4">
          <p className="caption">Database</p>
          <div className="rounded-lg border border-[--rule] bg-[--surface] p-6">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="caption">Employees</p><p className="font-display text-xl mt-1 tabular-nums">{empCount ?? 0}</p></div>
              <div><p className="caption">Trainings</p><p className="font-display text-xl mt-1 tabular-nums">{trCount ?? 0}</p></div>
              <div><p className="caption">Completions</p><p className="font-display text-xl mt-1 tabular-nums">{compCount ?? 0}</p></div>
              <div><p className="caption">Separations</p><p className="font-display text-xl mt-1 tabular-nums">{sepCount ?? 0}</p></div>
            </div>
          </div>

          <p className="caption mt-6">Quick links</p>
          <div className="rounded-lg border border-[--rule] bg-[--surface] divide-y divide-[--rule]">
            <LinkItem href="/settings/account" label="Account" description="Sign-in email and sign-out" />
            <LinkItem href="/ingestion" label="Ingestion" description="Sync data, review queue" />
            <LinkItem href="/reports" label="Reports" description="PDF and CSV exports" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkItem({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className="flex justify-between items-center px-6 py-3 hover:bg-[--surface-alt] transition-colors">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-[--ink-muted]">{description}</p>
      </div>
      <span className="text-[--ink-muted]">→</span>
    </Link>
  );
}
