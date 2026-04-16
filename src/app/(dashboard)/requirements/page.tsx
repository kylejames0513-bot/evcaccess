import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createRequirementAction, deleteRequirementAction } from "@/app/actions/requirements";

export const dynamic = "force-dynamic";

export default async function RequirementsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // All requirements with training info
  const { data: requirements } = await supabase
    .from("requirements")
    .select("id, training_id, role, department, required_within_days_of_hire, created_at")
    .order("created_at", { ascending: false });

  // All trainings for dropdown
  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code, title")
    .eq("active", true)
    .order("title");

  const trainingMap = new Map((trainings ?? []).map(t => [t.id, t]));

  // Distinct positions and departments from employees
  const { data: empMeta } = await supabase
    .from("employees")
    .select("position, department, location")
    .eq("status", "active");

  const positions = Array.from(new Set((empMeta ?? []).map(e => e.position).filter((p): p is string => !!p && p !== ""))).sort();
  const departments = Array.from(new Set((empMeta ?? []).map(e => e.department).filter((d): d is string => !!d && d !== ""))).sort();
  const divisions = Array.from(new Set((empMeta ?? []).map(e => e.location).filter((l): l is string => !!l && l !== ""))).sort();

  // Group requirements by training
  const byTraining = new Map<string, typeof requirements>();
  for (const r of requirements ?? []) {
    if (!byTraining.has(r.training_id)) byTraining.set(r.training_id, []);
    byTraining.get(r.training_id)!.push(r);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="caption">Compliance rules</p>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
          Training Requirements
        </h1>
        <p className="font-display text-sm italic text-[--ink-soft] mt-1">
          Define which trainings are required by department, division, or position.
          Leave a field blank for "all." Rules feed directly into the compliance matrix.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
        {/* Add requirement form */}
        <div>
          <p className="caption mb-3">Add a requirement</p>
          <form action={createRequirementAction} className="rounded-lg border border-[--rule] bg-[--surface] p-6 space-y-4">
            <div>
              <label className="caption block mb-1">Training</label>
              <select name="training_id" required className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                <option value="">Select training…</option>
                {(trainings ?? []).map(t => (
                  <option key={t.id} value={t.id}>{t.title} ({t.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="caption block mb-1">Position (blank = all positions)</label>
              <input
                name="role"
                list="positions"
                placeholder="e.g., DSP, Nurse, Case Manager"
                className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm"
              />
              <datalist id="positions">
                {positions.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div>
              <label className="caption block mb-1">Department (blank = all departments)</label>
              <input
                name="department"
                list="departments"
                placeholder="e.g., Residential, Behavioral Health"
                className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm"
              />
              <datalist id="departments">
                {departments.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>
            <div>
              <label className="caption block mb-1">Due within days of hire (optional)</label>
              <input
                name="required_within_days_of_hire"
                type="number"
                min="0"
                placeholder="e.g., 30, 90, 365"
                className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90"
            >
              Add requirement
            </button>
            <p className="text-xs text-[--ink-muted]">
              Example: "CPR & First Aid" required for all "Residential" department employees
              — select CPR & First Aid, leave position blank, enter "Residential" for department.
            </p>
          </form>

          {/* Quick add: all employees for common trainings */}
          <div className="mt-4 rounded-lg border border-[--rule] bg-[--surface] p-4">
            <p className="caption mb-2">Quick rules</p>
            <p className="text-xs text-[--ink-muted] mb-3">
              Add a universal requirement (all employees must complete):
            </p>
            <div className="flex flex-wrap gap-2">
              {(trainings ?? []).filter(t => !byTraining.has(t.id)).slice(0, 8).map(t => (
                <form key={t.id} action={createRequirementAction}>
                  <input type="hidden" name="training_id" value={t.id} />
                  <button type="submit" className="rounded-full border border-[--rule] px-3 py-1 text-xs hover:bg-[--surface-alt] transition-colors">
                    + {t.code}
                  </button>
                </form>
              ))}
            </div>
          </div>
        </div>

        {/* Current requirements */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="caption">Active requirements · {(requirements ?? []).length}</p>
          </div>

          {(requirements ?? []).length === 0 ? (
            <div className="rounded-lg border border-[--rule] bg-[--surface] p-12 text-center">
              <p className="font-display italic text-[--ink-muted]">
                No requirements defined yet. Add one to start building your compliance matrix.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(byTraining.entries()).map(([trainingId, reqs]) => {
                const training = trainingMap.get(trainingId);
                return (
                  <div key={trainingId} className="rounded-lg border border-[--rule] bg-[--surface]">
                    <div className="px-5 py-3 border-b border-[--rule] flex items-center justify-between">
                      <div>
                        <Link href={`/trainings/${trainingId}`} className="font-medium text-[--accent] hover:underline">
                          {training?.title ?? "Unknown"}
                        </Link>
                        <span className="ml-2 text-xs text-[--ink-muted] font-mono">{training?.code}</span>
                      </div>
                      <span className="caption">{reqs?.length ?? 0} rule{(reqs?.length ?? 0) === 1 ? "" : "s"}</span>
                    </div>
                    <ul className="divide-y divide-[--rule]">
                      {(reqs ?? []).map(r => (
                        <li key={r.id} className="flex items-center justify-between px-5 py-3 hover:bg-[--surface-alt]">
                          <div className="text-sm">
                            <span className="text-[--ink]">
                              {r.role && r.department
                                ? `${r.role} in ${r.department}`
                                : r.role
                                  ? `Position: ${r.role}`
                                  : r.department
                                    ? `Department: ${r.department}`
                                    : "All employees"}
                            </span>
                            {r.required_within_days_of_hire != null && (
                              <span className="text-[--ink-muted] ml-2">
                                · due within {r.required_within_days_of_hire} days of hire
                              </span>
                            )}
                          </div>
                          <form action={deleteRequirementAction}>
                            <input type="hidden" name="requirement_id" value={r.id} />
                            <input type="hidden" name="training_id" value={trainingId} />
                            <button type="submit" className="text-xs text-[--alert] hover:underline">
                              Remove
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
