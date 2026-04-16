import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveSigninSessionAction } from "@/app/actions/signin-session";

export const dynamic = "force-dynamic";

export default async function SigninQueuePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const { data: sessions } = await supabase
    .from("signin_sessions")
    .select("id, raw_name, arrival_time, class_id, employee_id, resolved, device_info")
    .eq("org_id", profile.org_id)
    .order("arrival_time", { ascending: false })
    .limit(100);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, first_name, last_name, paylocity_id")
    .eq("org_id", profile.org_id)
    .eq("status", "active")
    .order("last_name");

  const { data: classes } = await supabase
    .from("classes")
    .select("id, training_type_id, scheduled_date")
    .eq("org_id", profile.org_id)
    .limit(200);

  const { data: trainingTypes } = await supabase
    .from("training_types")
    .select("id, name")
    .eq("org_id", profile.org_id);

  const classMap = new Map(classes?.map(c => [c.id, c]) ?? []);
  const trainingMap = new Map(trainingTypes?.map(t => [t.id, t.name]) ?? []);
  const employeeMap = new Map(employees?.map(e => [e.id, `${e.last_name}, ${e.first_name}`]) ?? []);

  const unresolved = (sessions ?? []).filter(s => !s.resolved);
  const resolved = (sessions ?? []).filter(s => s.resolved);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#e8eaed]">Sign-in Queue</h1>
        <p className="mt-1 text-sm text-[#8b8fa3]">
          Match kiosk sign-ins to employees. {unresolved.length} unresolved.
        </p>
      </div>

      {unresolved.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[#e8eaed] mb-3">Unresolved</h2>
          <div className="rounded-lg border border-[#2a2e3d] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1d27] text-[#8b8fa3]">
                <tr>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Class</th>
                  <th className="px-4 py-2 text-left">Match to Employee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2e3d]">
                {unresolved.map((s) => {
                  const cls = s.class_id ? classMap.get(s.class_id) : null;
                  const trainingName = cls ? trainingMap.get(cls.training_type_id) ?? "" : "";
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-2 text-[#8b8fa3]">
                        {new Date(s.arrival_time).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 font-medium">{s.raw_name}</td>
                      <td className="px-4 py-2 text-[#8b8fa3]">
                        {trainingName || "\u2014"}
                      </td>
                      <td className="px-4 py-2">
                        <form action={resolveSigninSessionAction} className="flex items-center gap-2">
                          <input type="hidden" name="session_id" value={s.id} />
                          <select
                            name="employee_id"
                            required
                            className="rounded border border-[#2a2e3d] bg-[#0f1117] px-2 py-1 text-sm text-[#e8eaed]"
                          >
                            <option value="">Select employee\u2026</option>
                            {(employees ?? []).map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.last_name}, {e.first_name} ({e.paylocity_id})
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded bg-[#3b82f6] px-3 py-1 text-xs text-white hover:bg-[#2563eb]"
                          >
                            Resolve
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-[#e8eaed] mb-3">Recently Resolved</h2>
          <div className="rounded-lg border border-[#2a2e3d] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1d27] text-[#8b8fa3]">
                <tr>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Matched To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2e3d]">
                {resolved.slice(0, 30).map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 text-[#8b8fa3]">
                      {new Date(s.arrival_time).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{s.raw_name}</td>
                    <td className="px-4 py-2 text-[#8b8fa3]">
                      {s.employee_id ? employeeMap.get(s.employee_id) ?? s.employee_id : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!sessions || sessions.length === 0) && (
        <p className="text-sm text-[#8b8fa3]">No sign-in sessions yet. Share the kiosk link to get started.</p>
      )}
    </div>
  );
}
