import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TrainingCatalogTable, type TrainingRow } from "@/components/training-hub/training-catalog-table";

export const dynamic = "force-dynamic";

export default async function TrainingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code, title, category, cadence_type, cadence_months, grace_days, regulatory_citation, active")
    .order("code");

  // Get completion counts per training
  const trainingIds = (trainings ?? []).map(t => t.id);
  const counts = new Map<string, number>();
  if (trainingIds.length > 0) {
    for (const tid of trainingIds) {
      const { count } = await supabase
        .from("completions")
        .select("id", { count: "exact", head: true })
        .eq("training_id", tid);
      counts.set(tid, count ?? 0);
    }
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
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="caption">Catalog</p>
          <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
            Training Catalog
          </h1>
          <p className="font-display text-sm italic text-[--ink-soft] mt-1">
            Configure how often each training renews. Changes apply to every completion on record.
          </p>
        </div>
        <Link
          href="/trainings/new"
          className="rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90"
        >
          Add training
        </Link>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total" value={rows.length} />
        <StatCard label="Configured" value={rows.filter(r => r.cadence_type !== "unset" && r.active).length} />
        <StatCard label="Unconfigured" value={unconfiguredCount} warn={unconfiguredCount > 0} />
        <StatCard label="Inactive" value={rows.filter(r => !r.active).length} />
      </div>

      <TrainingCatalogTable rows={rows} />
    </div>
  );
}

function StatCard({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-[--rule] bg-[--surface] p-4">
      <p className="caption">{label}</p>
      <p className={`font-display text-2xl font-medium mt-1 tabular-nums ${warn ? "text-[--warn]" : ""}`}>
        {value}
      </p>
    </div>
  );
}
