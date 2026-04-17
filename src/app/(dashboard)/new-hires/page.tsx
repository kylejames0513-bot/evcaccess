import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader, Pill, PrimaryLink, Section } from "@/components/training-hub/page-primitives";

const STAGE_LABELS: Record<string, string> = {
  offer_accepted: "Offer Accepted",
  pre_hire_docs: "Pre-Hire Docs",
  day_one_setup: "Day One Setup",
  orientation: "Orientation",
  thirty_day: "30-Day Check",
  sixty_day: "60-Day Check",
  ninety_day: "90-Day Check",
  complete: "Complete",
  withdrew: "Withdrew",
  terminated_in_probation: "Term. in Probation",
};

const ACTIVE_STAGES = [
  "offer_accepted", "pre_hire_docs", "day_one_setup", "orientation",
  "thirty_day", "sixty_day", "ninety_day",
];

export default async function NewHiresPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hires } = await supabase
    .from("new_hires")
    .select("id, legal_last_name, legal_first_name, preferred_name, position, department, stage, stage_entry_date, planned_start_date, actual_start_date, supervisor_name_raw, hire_month, hire_year")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = hires ?? [];
  const active = rows.filter(h => ACTIVE_STAGES.includes(h.stage));
  const completed = rows.filter(h => h.stage === "complete");
  const exited = rows.filter(h => ["withdrew", "terminated_in_probation"].includes(h.stage));

  const byStage = new Map<string, typeof rows>();
  for (const stage of ACTIVE_STAGES) {
    byStage.set(stage, active.filter(h => h.stage === stage));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pillar II"
        title="New Hire Pipeline"
        subtitle={
          active.length > 0
            ? `${active.length} hire${active.length === 1 ? "" : "s"} in flight. ${completed.length} completed this period.`
            : "No new hires in flight. The pipeline is clear."
        }
        actions={<PrimaryLink href="/new-hires/new">Start a new hire</PrimaryLink>}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {ACTIVE_STAGES.map((stage) => {
          const stageHires = byStage.get(stage) ?? [];
          return (
            <div key={stage} className="panel-sunk p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="caption">{STAGE_LABELS[stage]}</p>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[--surface] px-1.5 text-xs font-medium tabular">
                  {stageHires.length}
                </span>
              </div>
              <div className="space-y-2">
                {stageHires.length === 0 ? (
                  <p className="py-2 text-xs italic text-[--ink-muted]">Empty</p>
                ) : (
                  stageHires.map((hire) => (
                    <Link
                      key={hire.id}
                      href={`/new-hires/${hire.id}`}
                      className="block rounded-md border border-[--rule] bg-[--surface] p-3 transition-colors hover:border-[--accent]/30 focus-ring"
                    >
                      <p className="text-sm font-medium text-[--ink]">
                        {hire.preferred_name ?? hire.legal_first_name} {hire.legal_last_name}
                      </p>
                      <p className="mt-0.5 text-xs text-[--ink-muted]">{hire.position ?? "—"}</p>
                      {hire.stage_entry_date && (
                        <p className="mt-1 text-xs tabular text-[--ink-muted]">
                          In stage since {new Date(hire.stage_entry_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(completed.length > 0 || exited.length > 0) && (
        <Section label="Closed">
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--rule]">
                  <th className="caption px-4 py-3 text-left">Name</th>
                  <th className="caption px-4 py-3 text-left">Position</th>
                  <th className="caption px-4 py-3 text-left">Outcome</th>
                  <th className="caption px-4 py-3 text-left">Start Date</th>
                </tr>
              </thead>
              <tbody>
                {[...completed, ...exited].map((hire) => (
                  <tr key={hire.id} className="row-hover border-b border-[--rule] last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/new-hires/${hire.id}`} className="text-[--accent] hover:underline">
                        {hire.legal_first_name} {hire.legal_last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[--ink-soft]">{hire.position ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Pill tone={hire.stage === "complete" ? "success" : "alert"}>
                        {STAGE_LABELS[hire.stage] ?? hire.stage}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 tabular text-[--ink-soft]">
                      {hire.actual_start_date
                        ? new Date(hire.actual_start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
