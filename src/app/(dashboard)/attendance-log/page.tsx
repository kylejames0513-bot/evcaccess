import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyPanel, PageHeader, Pill } from "@/components/training-hub/page-primitives";

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

  const empMap = new Map(employees?.map((e) => [e.id, `${e.legal_last_name}, ${e.legal_first_name}`]) ?? []);
  const ttMap = new Map(trainings?.map((t) => [t.id, t.title]) ?? []);

  const sourceLabel = (s: string | null) => {
    switch (s) {
      case "attendance_tracker":
        return "Google Sheet";
      case "manual":
        return "Manual";
      case "qr_signin":
        return "QR Sign-in";
      case "tracker_xlsm":
        return "NH Tracker";
      default:
        return s ?? "—";
    }
  };

  const hasRows = (completions?.length ?? 0) > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Training"
        title="Attendance Log"
        subtitle="Every training completion on record, newest first."
      />

      {!hasRows ? (
        <EmptyPanel title="No training completions recorded yet. Run your first ingestion to populate." />
      ) : (
        <div className="panel overflow-x-auto">
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
              {(completions ?? []).map((c) => (
                <tr key={c.id} className="row-hover border-b border-[--rule] last:border-0">
                  <td className="px-4 py-3 tabular text-[--ink-soft]">
                    {c.completed_on
                      ? new Date(c.completed_on + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{empMap.get(c.employee_id) ?? c.employee_id}</td>
                  <td className="px-4 py-3">{ttMap.get(c.training_id) ?? c.training_id}</td>
                  <td className="px-4 py-3">
                    <Pill
                      tone={
                        c.status === "compliant"
                          ? "success"
                          : c.status === "failed"
                            ? "alert"
                            : "muted"
                      }
                    >
                      {c.status}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-[--ink-muted]">{sourceLabel(c.source)}</td>
                  <td className="px-4 py-3 tabular text-[--ink-muted]">
                    {c.expires_on
                      ? new Date(c.expires_on + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
