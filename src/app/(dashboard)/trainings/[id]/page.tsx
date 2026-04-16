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

  const { data: t } = await supabase
    .from("trainings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const { count } = await supabase
    .from("completions")
    .select("id", { count: "exact", head: true })
    .eq("training_id", id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="px-0" style={{ color: "var(--accent)" }}>
        <Link href="/trainings">Back to catalog</Link>
      </Button>
      <header>
        <h1
          className="font-display text-2xl font-semibold tracking-tight"
          style={{ color: "var(--ink)" }}
        >
          {t.title}
        </h1>
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
          {t.code} &middot; {t.category ?? "Uncategorized"} &middot;{" "}
          {t.cadence_months ? `${t.cadence_months} month cadence` : "Non-expiring"}
        </p>
        {t.regulatory_citation ? (
          <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
            Reference: {t.regulatory_citation}
          </p>
        ) : null}
      </header>
      <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
        Total completion rows logged: {count ?? 0}
      </p>
    </div>
  );
}
