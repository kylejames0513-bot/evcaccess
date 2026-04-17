import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seedChecklistForHire } from "@/app/actions/new-hire";
import {
  EmptyPanel,
  PageHeader,
  PrimaryLink,
  Section,
  StatCard,
} from "@/components/training-hub/page-primitives";
import { NewHireCard } from "@/components/training-hub/new-hire-card";
import { isFullyOnboarded, templateFor, type HireForTemplate } from "@/lib/onboarding-templates";

export const dynamic = "force-dynamic";

const CLOSED_STAGES = new Set(["complete", "withdrew", "terminated_in_probation"]);

export default async function NewHiresPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hires } = await supabase
    .from("new_hires")
    .select(
      "id, legal_last_name, legal_first_name, preferred_name, position, department, location_title, hire_type, is_residential, lift_van_required, new_job_desc_required, stage, offer_accepted_date, planned_start_date, hire_month, hire_year",
    )
    .order("offer_accepted_date", { ascending: false })
    .limit(200);

  const rows = hires ?? [];
  const active = rows.filter((h) => !CLOSED_STAGES.has(h.stage));

  // Idempotent seed: make sure every active hire has its template items.
  // Runs in parallel and is a no-op for hires that already have them.
  await Promise.all(active.map((h) => seedChecklistForHire(h.id)));

  const { data: checklist } = await supabase
    .from("new_hire_checklist")
    .select("id, new_hire_id, item_key, item_name, kind, completed, completed_on")
    .in("new_hire_id", active.map((h) => h.id));

  const byHire = new Map<string, typeof checklist>();
  for (const row of checklist ?? []) {
    const list = byHire.get(row.new_hire_id) ?? [];
    list.push(row);
    byHire.set(row.new_hire_id, list);
  }

  const newHires = active.filter((h) => h.hire_type !== "transfer");
  const transfers = active.filter((h) => h.hire_type === "transfer");

  const totalRequired = active.reduce(
    (n, h) => n + templateFor(h as HireForTemplate).filter((t) => t.kind === "required").length,
    0,
  );
  const totalDone = (checklist ?? []).filter(
    (c) => c.kind === "required" && c.completed,
  ).length;
  const fullyComplete = active.filter((h) => isFullyOnboarded(h as HireForTemplate, byHire.get(h.id) ?? [])).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Onboarding"
        title="New Hires"
        subtitle={
          active.length === 0
            ? "No one in onboarding right now. Push a row from the tracker to get started."
            : `${active.length} in onboarding · ${totalDone}/${totalRequired} required items complete · ${fullyComplete} fully onboarded.`
        }
        actions={<PrimaryLink href="/new-hires/new">Add manually</PrimaryLink>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="In onboarding" value={active.length} />
        <StatCard label="New hires" value={newHires.length} />
        <StatCard label="Transfers" value={transfers.length} />
        <StatCard label="Fully onboarded" value={fullyComplete} tone={fullyComplete > 0 ? "success" : "default"} />
      </div>

      <Section label={`New hires · ${newHires.length}`}>
        {newHires.length === 0 ? (
          <EmptyPanel title="No new hires in onboarding." />
        ) : (
          <div className="space-y-3">
            {newHires.map((h) => (
              <NewHireCard key={h.id} hire={h} items={byHire.get(h.id) ?? []} />
            ))}
          </div>
        )}
      </Section>

      <Section label={`Transfers · ${transfers.length}`}>
        {transfers.length === 0 ? (
          <EmptyPanel title="No transfers in onboarding." />
        ) : (
          <div className="space-y-3">
            {transfers.map((h) => (
              <NewHireCard key={h.id} hire={h} items={byHire.get(h.id) ?? []} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
