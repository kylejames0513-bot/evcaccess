import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AttendanceLogPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const { data: completions } = await supabase
    .from("completions")
    .select("id, employee_id, training_type_id, completed_on, expires_on, source, notes")
    .eq("org_id", profile.org_id)
    .order("completed_on", { ascending: false })
    .limit(200);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("org_id", profile.org_id);

  const { data: trainingTypes } = await supabase
    .from("training_types")
    .select("id, name")
    .eq("org_id", profile.org_id);

  const empMap = new Map(employees?.map(e => [e.id, `${e.last_name}, ${e.first_name}`]) ?? []);
  const ttMap = new Map(trainingTypes?.map(t => [t.id, t.name]) ?? []);

  const sourceLabel = (s: string) => {
    switch (s) {
      case "signin": return "Kiosk";
      case "import_paylocity": return "Paylocity";
      case "import_phs": return "PHS";
      case "import_evc_training": return "EVC Import";
      case "manual": return "Manual";
      case "class_roster": return "Class";
      default: return s;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#e8eaed]">Attendance Log</h1>
        <p className="mt-1 text-sm text-[#8b8fa3]">
          Training completions across all sources. Showing last 200 records.
        </p>
      </div>

      {completions && completions.length > 0 ? (
        <div className="rounded-lg border border-[#2a2e3d] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#1a1d27] text-[#8b8fa3]">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-left">Training</th>
                <th className="px-4 py-2 text-left">Source</th>
                <th className="px-4 py-2 text-left">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2e3d]">
              {completions.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-[#8b8fa3]">{c.completed_on}</td>
                  <td className="px-4 py-2">{empMap.get(c.employee_id) ?? c.employee_id}</td>
                  <td className="px-4 py-2">{ttMap.get(c.training_type_id) ?? c.training_type_id}</td>
                  <td className="px-4 py-2 text-[#8b8fa3]">{sourceLabel(c.source)}</td>
                  <td className="px-4 py-2 text-[#8b8fa3]">{c.expires_on ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[#8b8fa3]">No training completions recorded yet.</p>
      )}
    </div>
  );
}
