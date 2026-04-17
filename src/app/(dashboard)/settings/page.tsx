import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader, Section, StatCard } from "@/components/training-hub/page-primitives";

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
      <PageHeader eyebrow="Configuration" title="Settings" />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Org settings form */}
        <Section label="Organization">
          <form action={updateOrg} className="panel p-6 space-y-4">
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
            <button type="submit" className="rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--accent-ink] transition-colors hover:bg-[--accent-hover] focus-ring">
              Save changes
            </button>
          </form>
        </Section>

        {/* Database stats + links */}
        <div className="space-y-6">
          <Section label="Database">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Employees" value={empCount ?? 0} />
              <StatCard label="Trainings" value={trCount ?? 0} />
              <StatCard label="Completions" value={compCount ?? 0} />
              <StatCard label="Separations" value={sepCount ?? 0} />
            </div>
          </Section>

          <Section label="Quick links">
            <div className="panel divide-y divide-[--rule]">
              <LinkItem href="/settings/account" label="Account" description="Sign-in email and sign-out" />
              <LinkItem href="/ingestion" label="Ingestion" description="Sync data, review queue" />
              <LinkItem href="/reports" label="Reports" description="PDF and CSV exports" />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function LinkItem({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-[--surface-alt]">
      <div>
        <p className="text-sm font-medium text-[--ink]">{label}</p>
        <p className="text-xs text-[--ink-muted]">{description}</p>
      </div>
      <span className="text-[--ink-muted]">→</span>
    </Link>
  );
}
