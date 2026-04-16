import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

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

  // Group active hires by stage for kanban-style display
  const byStage = new Map<string, typeof rows>();
  for (const stage of ACTIVE_STAGES) {
    byStage.set(stage, active.filter(h => h.stage === stage));
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="caption">Pillar II</p>
          <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
            New Hire Pipeline
          </h1>
          <p className="font-display text-sm italic text-[--ink-soft] mt-1">
            {active.length > 0
              ? `${active.length} hire${active.length === 1 ? "" : "s"} in flight. ${completed.length} completed this period.`
              : "No new hires in flight. The pipeline is clear."}
          </p>
        </div>
        <Button asChild className="rounded-md bg-[--accent] text-white hover:bg-[--accent]/90">
          <Link href="/new-hires/new">Start a new hire</Link>
        </Button>
      </div>

      {/* Pipeline columns */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {ACTIVE_STAGES.map((stage) => {
          const stageHires = byStage.get(stage) ?? [];
          return (
            <div key={stage} className="rounded-lg border border-[--rule] bg-[--surface-alt] p-3">
              <div className="flex items-center justify-between mb-3">
                <p className="caption">{STAGE_LABELS[stage]}</p>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[--surface] text-xs font-medium tabular-nums">
                  {stageHires.length}
                </span>
              </div>
              <div className="space-y-2">
                {stageHires.length === 0 ? (
                  <p className="text-xs text-[--ink-muted] italic py-2">Empty</p>
                ) : (
                  stageHires.map((hire) => (
                    <Link
                      key={hire.id}
                      href={`/new-hires/${hire.id}`}
                      className="block rounded-md border border-[--rule] bg-[--surface] p-3 hover:border-[--accent]/30 transition-colors"
                    >
                      <p className="text-sm font-medium">
                        {hire.preferred_name ?? hire.legal_first_name} {hire.legal_last_name}
                      </p>
                      <p className="text-xs text-[--ink-muted] mt-0.5">{hire.position ?? "—"}</p>
                      {hire.stage_entry_date && (
                        <p className="text-xs text-[--ink-muted] mt-1 tabular-nums">
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

      {/* Completed + exited */}
      {(completed.length > 0 || exited.length > 0) && (
        <div className="space-y-4">
          <p className="caption">Closed</p>
          <div className="overflow-x-auto rounded-lg border border-[--rule] bg-[--surface]">
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
                  <tr key={hire.id} className="border-b border-[--rule] last:border-0 hover:bg-[--surface-alt]">
                    <td className="px-4 py-3">
                      <Link href={`/new-hires/${hire.id}`} className="text-[--accent] hover:underline">
                        {hire.legal_first_name} {hire.legal_last_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[--ink-soft]">{hire.position ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        hire.stage === "complete" ? "bg-[--success-soft] text-[--success]" : "bg-[--alert-soft] text-[--alert]"
                      }`}>
                        {STAGE_LABELS[hire.stage] ?? hire.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[--ink-soft]">
                      {hire.actual_start_date ? new Date(hire.actual_start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
