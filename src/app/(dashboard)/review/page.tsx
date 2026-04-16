import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmployeePicker, type PickerEmployee } from "@/components/training-hub/employee-picker";
import {
  confirmMatchAction,
  skipReviewItemAction,
  bulkAcceptSuggestionsAction,
} from "@/app/actions/review-queue";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: items } = await supabase
    .from("review_queue")
    .select("id, source, reason, raw_payload, suggested_match_employee_id, suggested_match_score, created_at")
    .eq("resolved", false)
    .order("suggested_match_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: recentlyResolved } = await supabase
    .from("review_queue")
    .select("id, source, reason, raw_payload, resolved_at, resolved_by, resolution_notes")
    .eq("resolved", true)
    .order("resolved_at", { ascending: false })
    .limit(20);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_id, legal_first_name, legal_last_name, department")
    .order("legal_last_name");

  const pickerEmployees: PickerEmployee[] = (employees ?? []).map(e => ({
    id: e.id,
    name: `${e.legal_last_name}, ${e.legal_first_name}`,
    employee_id: e.employee_id,
    department: e.department,
  }));

  const empById = new Map<string, PickerEmployee>();
  for (const e of pickerEmployees) empById.set(e.id, e);

  const unresolvedCount = items?.length ?? 0;
  const highConfidenceCount = (items ?? []).filter(i => Number(i.suggested_match_score) >= 0.85).length;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="caption">Reconciliation</p>
          <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
            Review Queue
          </h1>
          <p className="font-display text-sm italic text-[--ink-soft] mt-1">
            {unresolvedCount === 0
              ? "Nothing unresolved. Ingestion is clean."
              : `${unresolvedCount} item${unresolvedCount === 1 ? "" : "s"} awaiting confirmation.`}
          </p>
        </div>
        {highConfidenceCount > 0 && (
          <form action={bulkAcceptSuggestionsAction}>
            <button
              type="submit"
              className="rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90"
            >
              Auto-accept {highConfidenceCount} high-confidence match{highConfidenceCount === 1 ? "" : "es"}
            </button>
          </form>
        )}
      </div>

      {unresolvedCount === 0 ? (
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-12 text-center">
          <p className="font-display italic text-[--ink-muted]">
            No items in the review queue. Ingestion resolved every record cleanly.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="caption">Unresolved · {unresolvedCount}</p>
          {(items ?? []).map(item => {
            const payload = item.raw_payload as Record<string, unknown> | null;
            const rawName = payload
              ? `${String(payload.lastName ?? "")}, ${String(payload.firstName ?? "")}`.replace(/^, /, "").replace(/, $/, "")
              : "—";
            const suggestion = item.suggested_match_employee_id ? empById.get(item.suggested_match_employee_id) : null;
            const score = item.suggested_match_score ? Math.round(Number(item.suggested_match_score) * 100) : null;

            return (
              <div key={item.id} className="rounded-lg border border-[--rule] bg-[--surface] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[--ink]">{rawName || "—"}</span>
                      <span className="caption bg-[--surface-alt] px-2 py-0.5 rounded">{item.source}</span>
                      <span className="caption bg-[--warn-soft] text-[--warn] px-2 py-0.5 rounded">{item.reason}</span>
                    </div>
                    {suggestion && (
                      <p className="mt-2 text-sm text-[--ink-soft]">
                        Suggested: <span className="text-[--ink] font-medium">{suggestion.name}</span>
                        <span className="text-[--ink-muted] ml-2">{suggestion.employee_id}</span>
                        {score !== null && (
                          <span className={`ml-2 text-xs font-medium ${score >= 85 ? "text-[--success]" : score >= 70 ? "text-[--warn]" : "text-[--ink-muted]"}`}>
                            {score}% match
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-end gap-2 flex-wrap">
                  <form action={confirmMatchAction} className="flex-1 min-w-[280px] flex items-end gap-2">
                    <input type="hidden" name="item_id" value={item.id} />
                    <div className="flex-1">
                      <label className="caption block mb-1">Match to employee</label>
                      <EmployeePicker
                        employees={pickerEmployees}
                        name="employee_id"
                        defaultValue={item.suggested_match_employee_id ?? undefined}
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-md bg-[--accent] px-3 py-1.5 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90 whitespace-nowrap"
                    >
                      Confirm match
                    </button>
                  </form>
                  <form action={skipReviewItemAction}>
                    <input type="hidden" name="item_id" value={item.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-[--rule] bg-[--surface] px-3 py-1.5 text-sm hover:bg-[--surface-alt]"
                    >
                      Skip
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(recentlyResolved?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <p className="caption">Recently resolved</p>
          <div className="overflow-x-auto rounded-lg border border-[--rule] bg-[--surface]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--rule]">
                  <th className="caption px-4 py-3 text-left">Name</th>
                  <th className="caption px-4 py-3 text-left">Source</th>
                  <th className="caption px-4 py-3 text-left">Resolution</th>
                  <th className="caption px-4 py-3 text-left">By</th>
                  <th className="caption px-4 py-3 text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {(recentlyResolved ?? []).map(item => {
                  const payload = item.raw_payload as Record<string, unknown> | null;
                  const rawName = payload
                    ? `${String(payload.lastName ?? "")}, ${String(payload.firstName ?? "")}`.replace(/^, /, "").replace(/, $/, "")
                    : "—";
                  return (
                    <tr key={item.id} className="border-b border-[--rule] last:border-0">
                      <td className="px-4 py-3">{rawName || "—"}</td>
                      <td className="px-4 py-3 text-[--ink-muted]">{item.source}</td>
                      <td className="px-4 py-3 text-[--ink-soft]">{item.resolution_notes ?? "—"}</td>
                      <td className="px-4 py-3 text-[--ink-muted]">{item.resolved_by ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-[--ink-muted]">
                        {item.resolved_at ? new Date(item.resolved_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
