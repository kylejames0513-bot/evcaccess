import { redirect } from "next/navigation";
import { ImportPanel } from "@/components/training-hub/import-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/training-hub/page-primitives";

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data"
        title="Imports"
        subtitle="Preview before commit. Re-running the same file stays idempotent at the database layer."
      />
      {sp.success && (
        <p className="rounded-md border border-[--success]/30 bg-[--success-soft] px-3 py-2 text-sm text-[--success]">
          Import finished. Review the run log for row-level detail.
        </p>
      )}
      {sp.error && (
        <p className="rounded-md border border-[--alert]/30 bg-[--alert-soft] px-3 py-2 text-sm text-[--alert]">
          {decodeURIComponent(sp.error)}
        </p>
      )}
      <ImportPanel />
    </div>
  );
}
