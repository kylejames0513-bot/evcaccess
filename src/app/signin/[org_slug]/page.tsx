import { notFound } from "next/navigation";
import { KioskSignInForm } from "@/components/training-hub/kiosk-sign-in-form";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

export default async function PublicSignInPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;

  let org: { id: string; name: string } | null = null;
  let classes: { id: string; scheduled_date: string }[] = [];
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data: o } = await admin
      .from("organizations")
      .select("id, name")
      .eq("slug", org_slug.toLowerCase())
      .maybeSingle();
    org = o;
    if (org) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: cls } = await admin
        .from("classes")
        .select("id, scheduled_date")
        .eq("org_id", org.id)
        .eq("scheduled_date", today)
        .in("status", ["scheduled", "in_progress"]);
      classes = cls ?? [];
    }
  } catch {
    notFound();
  }

  if (!org) notFound();

  return (
    <div className="min-h-screen bg-[#0f1117] px-4 py-10 text-[#e8eaed]">
      <div className="mx-auto max-w-lg space-y-8">
        <header className="text-center">
          <p className="text-sm text-[#8b8fa3]">Sign in</p>
          <h1 className="mt-2 text-2xl font-semibold">{org.name}</h1>
        </header>
        <KioskSignInForm orgSlug={org_slug} classes={classes} />
      </div>
    </div>
  );
}
