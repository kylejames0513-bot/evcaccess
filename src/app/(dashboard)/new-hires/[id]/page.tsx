import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { transitionStageAction, toggleChecklistItemAction, addChecklistItemAction } from "@/app/actions/new-hire";

export const dynamic = "force-dynamic";

const STAGES = [
  { key: "offer_accepted", label: "Offer Accepted" },
  { key: "pre_hire_docs", label: "Pre-Hire Docs" },
  { key: "day_one_setup", label: "Day One Setup" },
  { key: "orientation", label: "Orientation" },
  { key: "thirty_day", label: "30-Day Check" },
  { key: "sixty_day", label: "60-Day Check" },
  { key: "ninety_day", label: "90-Day Check" },
  { key: "complete", label: "Complete" },
];

const EXIT_STAGES = [
  { key: "withdrew", label: "Withdrew" },
  { key: "terminated_in_probation", label: "Terminated in Probation" },
];

export default async function NewHireDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hire } = await supabase
    .from("new_hires")
    .select("id, legal_first_name, legal_last_name, preferred_name, position, department, supervisor_name_raw, stage, stage_entry_date, offer_accepted_date, planned_start_date, actual_start_date, source, recruiter, hire_month, hire_year, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!hire) notFound();

  const { data: checklist } = await supabase
    .from("new_hire_checklist")
    .select("id, stage, item_name, required, completed, completed_on, completed_by, notes")
    .eq("new_hire_id", id)
    .order("stage")
    .order("required", { ascending: false });

  // Group checklist by stage
  const checklistByStage = new Map<string, typeof checklist>();
  for (const item of checklist ?? []) {
    if (!checklistByStage.has(item.stage)) checklistByStage.set(item.stage, []);
    checklistByStage.get(item.stage)!.push(item);
  }

  const currentStageIdx = STAGES.findIndex(s => s.key === hire.stage);
  const name = hire.preferred_name
    ? `${hire.preferred_name} ${hire.legal_last_name}`
    : `${hire.legal_first_name} ${hire.legal_last_name}`;

  const daysInStage = hire.stage_entry_date
    ? Math.floor((Date.now() - new Date(hire.stage_entry_date + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/new-hires" className="text-sm text-[--accent] hover:underline">← Pipeline</Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[32px] font-medium leading-tight tracking-[-0.01em]">
              {name}
            </h1>
            {hire.preferred_name && (
              <p className="caption mt-1">Legal: {hire.legal_first_name} {hire.legal_last_name}</p>
            )}
          </div>
          <div className="text-right">
            <p className="caption">Current stage</p>
            <p className="font-display text-lg mt-1">
              {STAGES.find(s => s.key === hire.stage)?.label ?? EXIT_STAGES.find(s => s.key === hire.stage)?.label ?? hire.stage}
            </p>
            <p className="text-xs text-[--ink-muted] mt-1 tabular-nums">
              {daysInStage} day{daysInStage === 1 ? "" : "s"} in stage
            </p>
          </div>
        </div>
      </div>

      {/* Stage progress bar */}
      {!["withdrew", "terminated_in_probation"].includes(hire.stage) && (
        <div>
          <div className="flex gap-1 mb-3">
            {STAGES.map((s, i) => (
              <div
                key={s.key}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  i <= currentStageIdx ? "bg-[--accent]" : "bg-[--surface-alt]"
                }`}
                title={s.label}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-[--ink-muted]">
            {STAGES.map(s => (
              <span key={s.key} className={`${s.key === hire.stage ? "text-[--accent] font-medium" : ""}`}>{s.label}</span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
        {/* Left: Profile */}
        <div className="space-y-6">
          <div className="rounded-lg border border-[--rule] bg-[--surface] p-6">
            <p className="caption mb-4">Profile</p>
            <dl className="space-y-3 text-sm">
              <Field label="Position" value={hire.position} />
              <Field label="Department" value={hire.department} />
              <Field label="Supervisor" value={hire.supervisor_name_raw} />
              <Field label="Recruiter" value={hire.recruiter} />
              <Field label="Source" value={hire.source} />
              <Field label="Offer accepted" value={formatDate(hire.offer_accepted_date)} />
              <Field label="Planned start" value={formatDate(hire.planned_start_date)} />
              <Field label="Actual start" value={formatDate(hire.actual_start_date)} />
              <Field label="Hire month/year" value={hire.hire_month && hire.hire_year ? `${hire.hire_month} ${hire.hire_year}` : null} />
            </dl>
          </div>

          {/* Stage actions */}
          <div className="rounded-lg border border-[--rule] bg-[--surface] p-6">
            <p className="caption mb-3">Advance to next stage</p>
            <form action={transitionStageAction} className="space-y-2">
              <input type="hidden" name="hire_id" value={hire.id} />
              <select name="next_stage" className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm" defaultValue={hire.stage}>
                <optgroup label="Active stages">
                  {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </optgroup>
                <optgroup label="Exit">
                  {EXIT_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </optgroup>
              </select>
              <button type="submit" className="w-full rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90">
                Save stage
              </button>
            </form>
          </div>
        </div>

        {/* Right: Checklist */}
        <div className="space-y-4">
          <p className="caption">Checklists</p>
          {checklistByStage.size === 0 ? (
            <div className="rounded-lg border border-[--rule] bg-[--surface] p-8 text-center">
              <p className="font-display italic text-[--ink-muted]">
                No checklist items yet. Advance to the next stage to auto-generate default items.
              </p>
            </div>
          ) : (
            Array.from(checklistByStage.entries()).map(([stage, items]) => {
              const stageLabel = STAGES.find(s => s.key === stage)?.label ?? stage;
              const done = items?.filter(i => i.completed).length ?? 0;
              const total = items?.length ?? 0;
              return (
                <div key={stage} className="rounded-lg border border-[--rule] bg-[--surface]">
                  <div className="flex items-center justify-between px-6 py-3 border-b border-[--rule]">
                    <h3 className="font-medium">{stageLabel}</h3>
                    <span className="text-xs tabular-nums text-[--ink-muted]">{done} / {total}</span>
                  </div>
                  <ul className="divide-y divide-[--rule]">
                    {(items ?? []).map(item => (
                      <li key={item.id} className="flex items-start gap-3 px-6 py-3">
                        <form action={toggleChecklistItemAction}>
                          <input type="hidden" name="item_id" value={item.id} />
                          <input type="hidden" name="hire_id" value={hire.id} />
                          <input type="hidden" name="completed" value={String(item.completed)} />
                          <button
                            type="submit"
                            className={`mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                              item.completed
                                ? "border-[--accent] bg-[--accent] text-[--primary-foreground]"
                                : "border-[--rule] hover:border-[--accent]"
                            }`}
                          >
                            {item.completed && <span className="text-xs">✓</span>}
                          </button>
                        </form>
                        <div className="flex-1">
                          <p className={`text-sm ${item.completed ? "line-through text-[--ink-muted]" : ""}`}>
                            {item.item_name}
                            {item.required && <span className="ml-2 text-[10px] text-[--ink-muted]">REQUIRED</span>}
                          </p>
                          {item.completed && item.completed_on && (
                            <p className="text-xs text-[--ink-muted] mt-0.5 tabular-nums">
                              Completed {formatDate(item.completed_on)} by {item.completed_by ?? "HR"}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}

          {/* Add custom item */}
          <form action={addChecklistItemAction} className="flex gap-2">
            <input type="hidden" name="hire_id" value={hire.id} />
            <input type="hidden" name="stage" value={hire.stage} />
            <input
              name="item_name"
              placeholder="Add custom checklist item…"
              className="flex-1 rounded-md border border-[--rule] bg-[--surface] px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-md border border-[--rule] bg-[--surface] px-4 py-2 text-sm hover:bg-[--surface-alt]">
              Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex">
      <dt className="caption w-32 shrink-0 pt-0.5">{label}</dt>
      <dd className={value ? "text-[--ink]" : "text-[--ink-muted] italic"}>{value || "—"}</dd>
    </div>
  );
}

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
