import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrainingCatalogTable, type TrainingRow } from "@/components/training-hub/training-catalog-table";
import { PageHeader, PrimaryLink, StatCard } from "@/components/training-hub/page-primitives";

export const dynamic = "force-dynamic";

export default async function TrainingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code, title, category, cadence_type, cadence_months, grace_days, regulatory_citation, active")
    .order("code");

  // One query for all completion counts, tallied client-side. Cheaper than
  // N HEAD requests even at 50+ trainings; PostgREST caps the rows returned
  // but we only need (training_id) so the payload is tiny. For very large
  // completion tables, consider a materialized view or RPC.
  const counts = new Map<string, number>();
  const { data: compRows } = await supabase
    .from("completions")
    .select("training_id");
  for (const row of compRows ?? []) {
    if (!row?.training_id) continue;
    counts.set(row.training_id, (counts.get(row.training_id) ?? 0) + 1);
  }

  const rows: TrainingRow[] = (trainings ?? []).map(t => ({
    id: t.id,
    code: t.code,
    title: t.title,
    category: t.category,
    cadence_type: t.cadence_type,
    cadence_months: t.cadence_months,
    grace_days: t.grace_days,
    regulatory_citation: t.regulatory_citation,
    active: t.active,
    completionCount: counts.get(t.id) ?? 0,
  }));

  const unconfiguredCount = rows.filter(r => r.cadence_type === "unset").length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalog"
        title="Training Catalog"
        subtitle="Configure how often each training renews. Changes apply to every completion on record."
        actions={<PrimaryLink href="/trainings/new">Add training</PrimaryLink>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total" value={rows.length} />
        <StatCard label="Configured" value={rows.filter(r => r.cadence_type !== "unset" && r.active).length} />
        <StatCard label="Unconfigured" value={unconfiguredCount} tone={unconfiguredCount > 0 ? "warn" : "default"} />
        <StatCard label="Inactive" value={rows.filter(r => !r.active).length} tone="muted" />
      </div>

      <TrainingCatalogTable rows={rows} />
    </div>
  );
}
