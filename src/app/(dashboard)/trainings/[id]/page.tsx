import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createRequirementAction, deleteRequirementAction } from "@/app/actions/requirements";

export const dynamic = "force-dynamic";

export default async function TrainingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: t } = await supabase
    .from("trainings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const { count: completionCount } = await supabase
    .from("completions")
    .select("id", { count: "exact", head: true })
    .eq("training_id", id);

  const { data: requirements } = await supabase
    .from("requirements")
    .select("id, role, department, required_within_days_of_hire, created_at")
    .eq("training_id", id)
    .order("created_at", { ascending: false });

  // Distinct positions and departments for dropdowns
  const { data: empMeta } = await supabase
    .from("employees")
    .select("position, department")
    .eq("status", "active");

  const positions = Array.from(new Set((empMeta ?? []).map(e => e.position).filter((p): p is string => !!p))).sort();
  const departments = Array.from(new Set((empMeta ?? []).map(e => e.department).filter((d): d is string => !!d))).sort();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/trainings" className="text-sm text-[--accent] hover:underline">← Catalog</Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <p className="caption">{t.code}</p>
            <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em] mt-1">
              {t.title}
            </h1>
            <p className="font-display text-sm italic text-[--ink-soft] mt-1">
              {t.cadence_type === "unset"
                ? "Cadence not yet configured — compliance won't flag this training."
                : `${t.cadence_type} · ${t.cadence_months ?? "—"} month${t.cadence_months === 1 ? "" : "s"} · ${t.grace_days}-day grace period`}
            </p>
          </div>
          <div className="text-right">
            <p className="caption">Completions</p>
            <p className="font-display text-2xl font-medium mt-1 tabular-nums">{completionCount ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        {/* Metadata */}
        <div>
          <p className="caption mb-3">Metadata</p>
          <div className="rounded-lg border border-[--rule] bg-[--surface] divide-y divide-[--rule]">
            <Field label="Code" value={t.code} />
            <Field label="Title" value={t.title} />
            <Field label="Category" value={t.category} />
            <Field label="Cadence type" value={t.cadence_type} />
            <Field label="Cadence months" value={t.cadence_months?.toString() ?? null} />
            <Field label="Grace days" value={t.grace_days?.toString() ?? null} />
            <Field label="Regulatory citation" value={t.regulatory_citation} />
            <Field label="Column key" value={(t as { column_key?: string }).column_key ?? null} />
            <Field label="Active" value={t.active ? "Yes" : "No"} />
          </div>
          <Link href="/trainings" className="mt-3 inline-block text-sm text-[--accent] hover:underline">
            Edit in catalog →
          </Link>
        </div>

        {/* Requirements */}
        <div className="space-y-4">
          <p className="caption">Requirements — who must complete this training</p>

          {(requirements?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-[--rule] bg-[--surface] p-4 text-center">
              <p className="font-display italic text-[--ink-muted] text-sm">
                No requirements yet. Every employee will be assumed to need this training.
              </p>
            </div>
          ) : (
            <ul className="rounded-lg border border-[--rule] bg-[--surface] divide-y divide-[--rule]">
              {(requirements ?? []).map(r => (
                <li key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm">
                    <span className="text-[--ink]">
                      {r.role ? `Role: ${r.role}` : null}
                      {r.role && r.department ? " · " : null}
                      {r.department ? `Dept: ${r.department}` : null}
                      {!r.role && !r.department ? "Everyone" : null}
                    </span>
                    {r.required_within_days_of_hire && (
                      <span className="text-[--ink-muted] ml-2">
                        within {r.required_within_days_of_hire}d of hire
                      </span>
                    )}
                  </div>
                  <form action={deleteRequirementAction}>
                    <input type="hidden" name="requirement_id" value={r.id} />
                    <input type="hidden" name="training_id" value={t.id} />
                    <button type="submit" className="text-xs text-[--alert] hover:underline">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {/* Add requirement form */}
          <form action={createRequirementAction} className="rounded-lg border border-[--rule] bg-[--surface] p-4 space-y-3">
            <p className="caption">Add requirement</p>
            <input type="hidden" name="training_id" value={t.id} />
            <div>
              <label className="caption block mb-1">Role / Position (optional)</label>
              <input
                name="role"
                list="positions"
                placeholder="e.g., DSP, Nurse, Administrator"
                className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-1.5 text-sm"
              />
              <datalist id="positions">
                {positions.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div>
              <label className="caption block mb-1">Department (optional)</label>
              <input
                name="department"
                list="departments"
                placeholder="e.g., Residential, Community"
                className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-1.5 text-sm"
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
                placeholder="e.g., 30, 90"
                className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-1.5 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90"
            >
              Add requirement
            </button>
            <p className="text-xs text-[--ink-muted]">
              Leave role and department blank for a universal requirement (all employees).
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex px-4 py-3">
      <dt className="caption w-40 shrink-0 pt-0.5">{label}</dt>
      <dd className={value ? "text-sm text-[--ink]" : "text-sm text-[--ink-muted] italic"}>{value || "—"}</dd>
    </div>
  );
}
