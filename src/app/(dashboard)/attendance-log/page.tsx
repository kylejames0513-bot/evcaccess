import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AttendanceLogPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: completions } = await supabase
    .from("completions")
    .select("id, employee_id, training_id, completed_on, expires_on, source, status, notes")
    .order("completed_on", { ascending: false })
    .limit(200);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, legal_last_name, legal_first_name");

  const { data: trainings } = await supabase
    .from("trainings")
    .select("id, title, code");

  const empMap = new Map(employees?.map(e => [e.id, `${e.legal_last_name}, ${e.legal_first_name}`]) ?? []);
  const ttMap = new Map(trainings?.map(t => [t.id, t.title]) ?? []);

  const sourceLabel = (s: string | null) => {
    switch (s) {
      case "attendance_tracker": return "Google Sheet";
      case "manual": return "Manual";
      case "qr_signin": return "QR Sign-in";
      case "tracker_xlsm": return "NH Tracker";
      default: return s ?? "—";
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="caption">Training</p>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em]">
          Attendance Log
        </h1>
        <p className="font-display text-sm italic text-[--ink-soft] mt-1">
          Every training completion on record, newest first.
        </p>
      </div>

      {completions && completions.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[--rule] bg-[--surface]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--rule]">
                <th className="caption px-4 py-3 text-left">Date</th>
                <th className="caption px-4 py-3 text-left">Employee</th>
                <th className="caption px-4 py-3 text-left">Training</th>
                <th className="caption px-4 py-3 text-left">Status</th>
                <th className="caption px-4 py-3 text-left">Source</th>
                <th className="caption px-4 py-3 text-left">Expires</th>
              </tr>
            </thead>
            <tbody>
              {completions.map((c) => (
                <tr key={c.id} className="border-b border-[--rule] last:border-0 hover:bg-[--surface-alt] transition-colors">
                  <td className="px-4 py-3 tabular-nums text-[--ink-soft]">
                    {c.completed_on ? new Date(c.completed_on + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-4 py-3">{empMap.get(c.employee_id) ?? c.employee_id}</td>
                  <td className="px-4 py-3">{ttMap.get(c.training_id) ?? c.training_id}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === "compliant" ? "bg-[--success-soft] text-[--success]" :
                      c.status === "failed" ? "bg-[--alert-soft] text-[--alert]" :
                      c.status === "exempt" ? "bg-[--surface-alt] text-[--ink-muted]" :
                      "bg-[--surface-alt] text-[--ink-muted]"
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[--ink-muted]">{sourceLabel(c.source)}</td>
                  <td className="px-4 py-3 tabular-nums text-[--ink-muted]">
                    {c.expires_on ? new Date(c.expires_on + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-12 text-center">
          <p className="font-display italic text-[--ink-muted]">
            No training completions recorded yet. Run your first ingestion to populate.
          </p>
        </div>
      )}
    </div>
  );
}
