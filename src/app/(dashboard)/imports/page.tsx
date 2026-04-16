import { redirect } from "next/navigation";
import { ImportPanel } from "@/components/training-hub/import-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Imports</h1>
        <p className="text-sm text-[#8b8fa3]">
          Preview before commit. Re running the same file stays idempotent at the database layer.
        </p>
      </div>
      {sp.success ? (
        <p className="text-sm text-[#22c55e]">Import finished. Review the run log for row level detail.</p>
      ) : null}
      {sp.error ? <p className="text-sm text-[#ef4444]">{decodeURIComponent(sp.error)}</p> : null}
      <ImportPanel />
    </div>
  );
}
