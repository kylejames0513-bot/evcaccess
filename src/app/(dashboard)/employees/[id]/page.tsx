import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logCompletionAction } from "@/app/actions/completion";
import { addExemptionAction, removeExemptionAction } from "@/app/actions/exemption";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: emp } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  if (!emp) notFound();

  const { data: completions } = await supabase
    .from("completions")
    .select("id, completed_on, expires_on, source, training_id, status, exempt_reason, notes")
    .eq("employee_id", id)
    .order("completed_on", { ascending: false });

  const typeIds = [...new Set((completions ?? []).map(c => c.training_id))];
  const { data: typeRows } = typeIds.length > 0
    ? await supabase.from("trainings").select("id, title, code").in("id", typeIds)
    : { data: [] as { id: string; title: string; code: string }[] };
  const typeMap = new Map((typeRows ?? []).map(t => [t.id, t]));

  // All trainings for the completion form
  const { data: allTrainings } = await supabase
    .from("trainings")
    .select("id, code, title")
    .eq("active", true)
    .order("title");

  const name = emp.preferred_name
    ? `${emp.preferred_name} ${emp.legal_last_name}`
    : `${emp.legal_first_name} ${emp.legal_last_name}`;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/employees" className="text-sm text-[--accent] hover:underline">← Roster</Link>
        <h1 className="font-display text-[32px] font-medium leading-tight tracking-[-0.01em] mt-2">
          {name}
        </h1>
        {emp.preferred_name && (
          <p className="caption mt-1">Legal: {emp.legal_first_name} {emp.legal_last_name}</p>
        )}
      </div>

      {/* Profile */}
      <div className="rounded-lg border border-[--rule] bg-[--surface] divide-y divide-[--rule]">
        <Field label="Employee ID" value={emp.employee_id} />
        <Field label="Position" value={emp.position} />
        <Field label="Department" value={emp.department} />
        <Field label="Location" value={emp.location} />
        <Field label="Status" value={emp.status} />
        <Field label="Hire date" value={emp.hire_date ? new Date(emp.hire_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null} />
        <Field label="Termination date" value={emp.termination_date ? new Date(emp.termination_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null} />
        <Field label="Email" value={emp.email} />
        <Field label="Phone" value={emp.phone} />
        <Field label="Aliases" value={(emp.known_aliases ?? []).length > 0 ? (emp.known_aliases as string[]).join("; ") : null} />
      </div>

      {/* Training history */}
      <div>
        <p className="caption mb-3">Training history · {(completions ?? []).length} records</p>
        {(completions ?? []).length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-[--rule] bg-[--surface]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[--rule]">
                  <th className="caption px-4 py-3 text-left">Training</th>
                  <th className="caption px-4 py-3 text-left">Completed</th>
                  <th className="caption px-4 py-3 text-left">Expires</th>
                  <th className="caption px-4 py-3 text-left">Status</th>
                  <th className="caption px-4 py-3 text-left">Source</th>
                  <th className="caption px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {(completions ?? []).map((c, i) => {
                  const tr = typeMap.get(c.training_id);
                  return (
                    <tr key={`${c.id}-${i}`} className="border-b border-[--rule] last:border-0 hover:bg-[--surface-alt]">
                      <td className="px-4 py-3 font-medium">{tr?.title ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-[--ink-soft]">
                        {c.completed_on ? new Date(c.completed_on + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[--ink-muted]">
                        {c.expires_on ? new Date(c.expires_on + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.status === "compliant" ? "bg-[--success-soft] text-[--success]" :
                          c.status === "exempt" ? "bg-[--surface-alt] text-[--ink-muted]" :
                          c.status === "failed" ? "bg-[--alert-soft] text-[--alert]" :
                          "bg-[--surface-alt] text-[--ink-muted]"
                        }`}>
                          {c.status}{c.status === "exempt" && c.exempt_reason ? ` (${c.exempt_reason})` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[--ink-muted]">{c.source ?? "—"}</td>
                      <td className="px-4 py-3 text-[--ink-muted] max-w-[200px] truncate">{c.notes ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-[--rule] bg-[--surface] p-8 text-center">
            <p className="font-display italic text-[--ink-muted]">
              No training records on file. Log a completion below or sync from the Attendance Tracker.
            </p>
          </div>
        )}
      </div>

      {/* Log completion form */}
      <div>
        <p className="caption mb-3">Log a completion</p>
        <form action={logCompletionAction} className="rounded-lg border border-[--rule] bg-[--surface] p-5 space-y-3">
          <input type="hidden" name="employee_id" value={emp.id} />
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="caption block mb-1">Training</label>
              <select name="training_id" required className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                <option value="">Select training…</option>
                {(allTrainings ?? []).map(t => (
                  <option key={t.id} value={t.id}>{t.title} ({t.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="caption block mb-1">Completed on</label>
              <input name="completed_on" type="date" required className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="caption block mb-1">Notes (optional)</label>
              <input name="notes" className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm" placeholder="Session, instructor, etc." />
            </div>
          </div>
          <button type="submit" className="rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90">
            Record completion
          </button>
        </form>
      </div>

      {/* Exemptions */}
      <div>
        <p className="caption mb-3">Exemptions</p>
        {(() => {
          const exemptions = (completions ?? []).filter(c => c.status === "exempt" && c.source === "manual_exemption");
          return exemptions.length > 0 ? (
            <div className="rounded-lg border border-[--rule] bg-[--surface] mb-4">
              <ul className="divide-y divide-[--rule]">
                {exemptions.map((ex, i) => {
                  const tr = typeMap.get(ex.training_id);
                  return (
                    <li key={`ex-${ex.id}-${i}`} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <span className="text-sm font-medium">{tr?.title ?? "Unknown training"}</span>
                        {ex.exempt_reason && (
                          <span className="text-xs text-[--ink-muted] ml-2">— {ex.exempt_reason}</span>
                        )}
                      </div>
                      <form action={removeExemptionAction}>
                        <input type="hidden" name="completion_id" value={ex.id} />
                        <input type="hidden" name="employee_id" value={emp.id} />
                        <button type="submit" className="text-xs text-[--alert] hover:underline">Remove</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null;
        })()}
        <form action={addExemptionAction} className="rounded-lg border border-[--rule] bg-[--surface] p-5 space-y-3">
          <input type="hidden" name="employee_id" value={emp.id} />
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="caption block mb-1">Exempt from training</label>
              <select name="training_id" required className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm">
                <option value="">Select training…</option>
                {(allTrainings ?? []).map(t => (
                  <option key={t.id} value={t.id}>{t.title} ({t.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="caption block mb-1">Reason</label>
              <input name="reason" className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm" placeholder="e.g., Administrative role, medical" />
            </div>
            <div className="flex items-end">
              <button type="submit" className="rounded-md border border-[--alert] text-[--alert] px-4 py-2 text-sm font-medium hover:bg-[--alert-soft]">
                Add exemption
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex px-6 py-3">
      <dt className="caption w-36 shrink-0 pt-0.5">{label}</dt>
      <dd className={value ? "text-sm text-[--ink]" : "text-sm text-[--ink-muted] italic"}>{value || "—"}</dd>
    </div>
  );
}
