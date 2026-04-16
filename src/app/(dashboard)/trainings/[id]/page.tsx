import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: t } = await supabase
    .from("training_types")
    .select("*")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!t) notFound();

  const { count } = await supabase
    .from("completions")
    .select("id", { count: "exact", head: true })
    .eq("training_type_id", id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="px-0 text-[#3b82f6]">
        <Link href="/trainings">Back to catalog</Link>
      </Button>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.name}</h1>
        <p className="text-sm text-[#8b8fa3]">
          {t.category} · {t.expiration_months ? `${t.expiration_months} month window` : "Non expiring"}
        </p>
        {t.regulatory_source ? (
          <p className="mt-2 text-sm text-[#5c6078]">Reference: {t.regulatory_source}</p>
        ) : null}
      </header>
      <p className="text-sm text-[#8b8fa3]">Total completion rows logged: {count ?? 0}</p>
    </div>
  );
}
