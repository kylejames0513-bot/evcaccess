import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createRequirementAction, deleteRequirementAction, createExclusionAction, deleteExclusionAction } from "@/app/actions/requirements";

export const dynamic = "force-dynamic";

export default async function RequirementsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: requirements } = await supabase
    .from("requirements")
    .select("id, training_id, role, department, required_within_days_of_hire, created_at")
    .order("created_at", { ascending: false });

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, code, title")
    .eq("active", true)
    .order("title");

  const trainingMap = new Map((trainings ?? []).map(t => [t.id, t]));

  // Exclusions
  const { data: exclusions } = await supabase
    .from("exclusions")
    .select("id, training_id, role, department, reason, created_at")
    .order("created_at", { ascending: false });

  const byTrainingExclusions = new Map<string, typeof exclusions>();
  for (const e of exclusions ?? []) {
    if (!byTrainingExclusions.has(e.training_id)) byTrainingExclusions.set(e.training_id, []);
    byTrainingExclusions.get(e.training_id)!.push(e);
  }

  // Get employee metadata with counts
  const { data: empMeta } = await supabase
    .from("employees")
    .select("position, department, location")
    .eq("status", "active");

  const allEmps = empMeta ?? [];

  // Count employees per position
  const positionCounts = new Map<string, number>();
  for (const e of allEmps) {
    if (e.position) positionCounts.set(e.position, (positionCounts.get(e.position) ?? 0) + 1);
  }
  const positions = Array.from(positionCounts.entries()).sort((a, b) => b[1] - a[1]);

  // Count employees per division (location field = real org department like "Residential")
  const divCounts = new Map<string, number>();
  for (const e of allEmps) {
    if (e.location) divCounts.set(e.location, (divCounts.get(e.location) ?? 0) + 1);
  }
  const departments = Array.from(divCounts.entries()).sort((a, b) => b[1] - a[1]);

  // Count employees per specific location/house (department field)
  const houseCounts = new Map<string, number>();
  for (const e of allEmps) {
    if (e.department) houseCounts.set(e.department, (houseCounts.get(e.department) ?? 0) + 1);
  }
  const divisions = Array.from(houseCounts.entries()).sort((a, b) => b[1] - a[1]);

  // Group requirements by training
  const byTraining = new Map<string, typeof requirements>();
  for (const r of requirements ?? []) {
    if (!byTraining.has(r.training_id)) byTraining.set(r.training_id, []);
    byTraining.get(r.training_id)!.push(r);
  }

  // How many employees a requirement would match
  function countMatching(role: string | null, dept: string | null): number {
    return allEmps.filter(e => {
      if (role && e.position !== role) return false;
      if (dept && e.department !== dept && e.location !== dept) return false;
      return true;
    }).length;
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
          Leave a field on "All" to apply universally. {allEmps.length} active employees total.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
        {/* Add requirement form */}
        <div>
          <p className="caption mb-3">Add a requirement</p>
          <form action={createRequirementAction} className="rounded-lg border border-[--rule] bg-[--surface] p-6 space-y-4">
            {/* Training select */}
            <div>
              <label className="caption block mb-1">Training</label>
              <select name="training_id" required className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                <option value="">Select training…</option>
                {(trainings ?? []).map(t => (
                  <option key={t.id} value={t.id}>{t.title} ({t.code})</option>
                ))}
              </select>
            </div>

            {/* Position select */}
            <div>
              <label className="caption block mb-1">Position</label>
              <select name="role" className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                <option value="">All positions ({allEmps.length} employees)</option>
                {positions.map(([pos, count]) => (
                  <option key={pos} value={pos}>{pos} ({count} employee{count === 1 ? "" : "s"})</option>
                ))}
              </select>
            </div>

            {/* Department select */}
            <div>
              <label className="caption block mb-1">Division / Department</label>
              <select name="department" className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                <option value="">All divisions ({allEmps.length} employees)</option>
                {departments.map(([dept, count]) => (
                  <option key={dept} value={dept}>{dept} ({count} employee{count === 1 ? "" : "s"})</option>
                ))}
              </select>
            </div>

            {/* Due within days */}
            <div>
              <label className="caption block mb-1">Due within days of hire (optional)</label>
              <select name="required_within_days_of_hire" className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                <option value="">No deadline</option>
                <option value="7">7 days (first week)</option>
                <option value="14">14 days (two weeks)</option>
                <option value="30">30 days (one month)</option>
                <option value="60">60 days (two months)</option>
                <option value="90">90 days (three months — probation)</option>
                <option value="180">180 days (six months)</option>
                <option value="365">365 days (one year)</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90"
            >
              Add requirement
            </button>
          </form>

          {/* Quick-add universal requirements */}
          <div className="mt-4 rounded-lg border border-[--rule] bg-[--surface] p-4">
            <p className="caption mb-2">Quick add — require for ALL employees</p>
            <div className="flex flex-wrap gap-2">
              {(trainings ?? []).filter(t => !byTraining.has(t.id)).slice(0, 12).map(t => (
                <form key={t.id} action={createRequirementAction}>
                  <input type="hidden" name="training_id" value={t.id} />
                  <button type="submit" className="rounded-full border border-[--rule] px-3 py-1 text-xs hover:bg-[--accent-soft] hover:text-[--accent] hover:border-[--accent]/30 transition-colors">
                    + {t.code}
                  </button>
                </form>
              ))}
            </div>
            {(trainings ?? []).filter(t => !byTraining.has(t.id)).length === 0 && (
              <p className="text-xs text-[--ink-muted] italic">All trainings have at least one requirement.</p>
            )}
          </div>

          {/* Reference: departments + positions */}
          <div className="mt-4 space-y-3">
            <details className="rounded-lg border border-[--rule] bg-[--surface]">
              <summary className="px-4 py-3 cursor-pointer caption hover:bg-[--surface-alt]">
                Departments ({departments.length})
              </summary>
              <ul className="border-t border-[--rule] divide-y divide-[--rule]">
                {departments.map(([dept, count]) => (
                  <li key={dept} className="px-4 py-2 flex justify-between text-sm">
                    <span>{dept}</span>
                    <span className="tabular-nums text-[--ink-muted]">{count}</span>
                  </li>
                ))}
              </ul>
            </details>
            <details className="rounded-lg border border-[--rule] bg-[--surface]">
              <summary className="px-4 py-3 cursor-pointer caption hover:bg-[--surface-alt]">
                Positions ({positions.length})
              </summary>
              <ul className="border-t border-[--rule] divide-y divide-[--rule] max-h-60 overflow-y-auto">
                {positions.map(([pos, count]) => (
                  <li key={pos} className="px-4 py-2 flex justify-between text-sm">
                    <span>{pos}</span>
                    <span className="tabular-nums text-[--ink-muted]">{count}</span>
                  </li>
                ))}
              </ul>
            </details>
            {divisions.length > 0 && (
              <details className="rounded-lg border border-[--rule] bg-[--surface]">
                <summary className="px-4 py-3 cursor-pointer caption hover:bg-[--surface-alt]">
                  Divisions / Locations ({divisions.length})
                </summary>
                <ul className="border-t border-[--rule] divide-y divide-[--rule]">
                  {divisions.map(([div, count]) => (
                    <li key={div} className="px-4 py-2 flex justify-between text-sm">
                      <span>{div}</span>
                      <span className="tabular-nums text-[--ink-muted]">{count}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
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
                No requirements defined yet. Use the form to specify which trainings each role or department must complete.
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
                      {(reqs ?? []).map(r => {
                        const matchCount = countMatching(r.role, r.department);
                        return (
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
                              <span className="ml-2 text-xs text-[--ink-muted]">
                                ({matchCount} employee{matchCount === 1 ? "" : "s"})
                              </span>
                              {r.required_within_days_of_hire != null && (
                                <span className="text-[--ink-muted] ml-2">
                                  · within {r.required_within_days_of_hire}d of hire
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
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Exclusions section */}
      <div className="space-y-6 border-t border-[--rule] pt-8">
        <div>
          <h2 className="font-display text-xl font-medium">Exclusions</h2>
          <p className="font-display text-sm italic text-[--ink-soft] mt-1">
            Exempt a specific department or position from a training requirement.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
          {/* Add exclusion form */}
          <div>
            <p className="caption mb-3">Add an exclusion</p>
            <form action={createExclusionAction} className="rounded-lg border border-[--rule] bg-[--surface] p-6 space-y-4">
              <div>
                <label className="caption block mb-1">Training to exclude from</label>
                <select name="training_id" required className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                  <option value="">Select training…</option>
                  {(trainings ?? []).map(t => (
                    <option key={t.id} value={t.id}>{t.title} ({t.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="caption block mb-1">Position to exclude</label>
                <select name="role" className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                  <option value="">Not position-specific</option>
                  {positions.map(([pos, count]) => (
                    <option key={pos} value={pos}>{pos} ({count})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="caption block mb-1">Department to exclude</label>
                <select name="department" className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                  <option value="">Not department-specific</option>
                  {departments.map(([dept, count]) => (
                    <option key={dept} value={dept}>{dept} ({count})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="caption block mb-1">Reason (optional)</label>
                <input name="reason" placeholder="e.g., Administrative role, not direct care" className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm" />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-[--alert] px-4 py-2 text-sm font-medium text-white hover:bg-[--alert]/90"
              >
                Add exclusion
              </button>
              <p className="text-xs text-[--ink-muted]">
                Must specify at least a position or department. Example: Exclude "Executive" department from Mealtime.
              </p>
            </form>
          </div>

          {/* Current exclusions */}
          <div>
            <p className="caption mb-3">Active exclusions · {(exclusions ?? []).length}</p>
            {(exclusions ?? []).length === 0 ? (
              <div className="rounded-lg border border-[--rule] bg-[--surface] p-8 text-center">
                <p className="font-display italic text-[--ink-muted]">
                  No exclusions yet. Everyone who matches a requirement must complete the training.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from(byTrainingExclusions.entries()).map(([trainingId, excs]) => {
                  const training = trainingMap.get(trainingId);
                  return (
                    <div key={trainingId} className="rounded-lg border border-[--alert]/20 bg-[--alert-soft] overflow-hidden">
                      <div className="px-5 py-3 border-b border-[--alert]/10 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-[--alert]">{training?.title ?? "Unknown"}</span>
                          <span className="ml-2 text-xs text-[--ink-muted] font-mono">{training?.code}</span>
                        </div>
                        <span className="caption text-[--alert]">{excs?.length ?? 0} exclusion{(excs?.length ?? 0) === 1 ? "" : "s"}</span>
                      </div>
                      <ul className="divide-y divide-[--alert]/10 bg-[--surface]">
                        {(excs ?? []).map(exc => (
                          <li key={exc.id} className="flex items-center justify-between px-5 py-3 hover:bg-[--surface-alt]">
                            <div className="text-sm">
                              <span className="text-[--ink]">
                                {exc.role && exc.department
                                  ? `${exc.role} in ${exc.department}`
                                  : exc.role
                                    ? `Position: ${exc.role}`
                                    : exc.department
                                      ? `Department: ${exc.department}`
                                      : "—"}
                              </span>
                              {exc.reason && (
                                <span className="text-[--ink-muted] ml-2 text-xs">— {exc.reason}</span>
                              )}
                            </div>
                            <form action={deleteExclusionAction}>
                              <input type="hidden" name="exclusion_id" value={exc.id} />
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
    </div>
  );
}
