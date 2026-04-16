import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  toggleOffboardingItemAction,
  generateOffboardingChecklistAction,
  addOffboardingItemAction,
} from "@/app/actions/separation";

export const dynamic = "force-dynamic";

export default async function SeparationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sep } = await supabase
    .from("separations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!sep) notFound();

  const { data: checklist } = await supabase
    .from("offboarding_checklist")
    .select("id, item_name, required, completed, completed_on, completed_by")
    .eq("separation_id", id)
    .order("required", { ascending: false });

  const fields = [
    { label: "Name", value: sep.legal_name },
    { label: "Position", value: sep.position },
    { label: "Department", value: sep.department },
    { label: "Supervisor", value: sep.supervisor_name_raw },
    { label: "Hire date", value: formatDate(sep.hire_date) },
    { label: "Separation date", value: formatDate(sep.separation_date) },
    { label: "Tenure", value: sep.tenure_days != null ? `${(sep.tenure_days / 365).toFixed(1)} years (${sep.tenure_days} days)` : null },
    { label: "Type", value: sep.separation_type },
    { label: "Reason (primary)", value: sep.reason_primary },
    { label: "Reason (secondary)", value: sep.reason_secondary },
    { label: "Rehire eligible", value: sep.rehire_eligible },
    { label: "Rehire notes", value: sep.rehire_notes },
    { label: "Exit interview", value: sep.exit_interview_status },
    { label: "Final pay date", value: formatDate(sep.final_pay_date) },
    { label: "PTO payout", value: sep.pto_payout != null ? `$${Number(sep.pto_payout).toFixed(2)}` : null },
    { label: "Benefits term date", value: formatDate(sep.benefits_term_date) },
    { label: "COBRA mailed", value: formatDate(sep.cobra_mailed_date) },
    { label: "Calendar year", value: sep.calendar_year },
    { label: "Fiscal year", value: sep.evc_fiscal_year },
    { label: "HR notes", value: sep.hr_notes },
  ];

  const done = (checklist ?? []).filter(c => c.completed).length;
  const total = (checklist ?? []).length;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/separations" className="text-sm text-[--accent] hover:underline">← All separations</Link>
        <h1 className="font-display text-[32px] font-medium leading-tight tracking-[-0.01em] mt-2">
          {sep.legal_name}
        </h1>
        <p className="caption mt-1">Separation record</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        {/* Left: Record */}
        <div>
          <p className="caption mb-3">Record</p>
          <div className="rounded-lg border border-[--rule] bg-[--surface] divide-y divide-[--rule]">
            {fields.map(({ label, value }) => value != null && value !== "" ? (
              <div key={label} className="flex px-6 py-3">
                <dt className="caption w-40 shrink-0 pt-0.5">{label}</dt>
                <dd className="text-sm text-[--ink]">{String(value)}</dd>
              </div>
            ) : null)}
          </div>
        </div>

        {/* Right: Offboarding checklist */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="caption">Offboarding checklist</p>
            {total > 0 && <span className="text-xs tabular-nums text-[--ink-muted]">{done} / {total}</span>}
          </div>

          {total === 0 ? (
            <div className="rounded-lg border border-[--rule] bg-[--surface] p-6 text-center">
              <p className="font-display italic text-[--ink-muted] text-sm mb-4">
                No checklist yet. Generate the default offboarding checklist.
              </p>
              <form action={generateOffboardingChecklistAction}>
                <input type="hidden" name="separation_id" value={sep.id} />
                <button type="submit" className="rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90">
                  Generate checklist
                </button>
              </form>
            </div>
          ) : (
            <div className="rounded-lg border border-[--rule] bg-[--surface]">
              <ul className="divide-y divide-[--rule]">
                {(checklist ?? []).map(item => (
                  <li key={item.id} className="flex items-start gap-3 px-6 py-3">
                    <form action={toggleOffboardingItemAction}>
                      <input type="hidden" name="item_id" value={item.id} />
                      <input type="hidden" name="separation_id" value={sep.id} />
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
                          {formatDate(item.completed_on)} by {item.completed_by ?? "HR"}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <form action={addOffboardingItemAction} className="border-t border-[--rule] p-3 flex gap-2">
                <input type="hidden" name="separation_id" value={sep.id} />
                <input
                  name="item_name"
                  placeholder="Add custom item…"
                  className="flex-1 rounded-md border border-[--rule] bg-[--bg] px-3 py-1.5 text-sm"
                />
                <button type="submit" className="rounded-md border border-[--rule] bg-[--surface] px-3 py-1.5 text-sm hover:bg-[--surface-alt]">
                  Add
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
