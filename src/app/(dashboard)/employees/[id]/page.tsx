import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createExemptionAction, deleteExemptionAction } from "@/app/actions/exemption";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) redirect("/onboarding");

  const { data: emp } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!emp) notFound();

  const { data: completions } = await supabase
    .from("completions")
    .select("completed_on, expires_on, source, training_type_id")
    .eq("employee_id", id)
    .order("completed_on", { ascending: false });

  const typeIds = [...new Set((completions ?? []).map((c) => c.training_type_id))];
  const { data: typeRows } =
    typeIds.length > 0
      ? await supabase.from("training_types").select("id, name").in("id", typeIds)
      : { data: [] as { id: string; name: string }[] };
  const typeName = new Map((typeRows ?? []).map((t) => [t.id, t.name]));

  const { data: exemptions } = await supabase
    .from("exemptions")
    .select("id, training_type_id, reason, granted_at, expires_on")
    .eq("employee_id", id);

  const { data: trainingTypes } = await supabase
    .from("training_types")
    .select("id, name")
    .eq("org_id", profile.org_id)
    .eq("archived", false)
    .order("name");

  const trainingTypeMap = new Map(trainingTypes?.map(t => [t.id, t.name]) ?? []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" className="mb-2 px-0 text-[#3b82f6]">
            <Link href="/employees">Back to roster</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {emp.first_name} {emp.last_name}
          </h1>
          <p className="font-mono text-sm text-[#8b8fa3]">{emp.paylocity_id}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-[#8b8fa3]">
            <span>{emp.position || "No position"}</span>
            <span>·</span>
            <span>{emp.location || "No location"}</span>
            <span>·</span>
            <Badge variant="secondary">{emp.status}</Badge>
          </div>
        </div>
      </div>
      <section>
        <h2 className="mb-3 text-lg font-medium">Training history</h2>
        <div className="overflow-hidden rounded-xl border border-[#2a2e3d]">
          <Table>
            <TableHeader>
              <TableRow className="border-[#2a2e3d] hover:bg-transparent">
                <TableHead className="text-[#8b8fa3]">Training</TableHead>
                <TableHead className="text-[#8b8fa3]">Completed</TableHead>
                <TableHead className="text-[#8b8fa3]">Expires</TableHead>
                <TableHead className="text-[#8b8fa3]">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(completions ?? []).length ? (
                (completions ?? []).map((c) => (
                  <TableRow key={`${c.completed_on}-${c.source}`} className="border-[#2a2e3d]">
                    <TableCell className="text-[#e8eaed]">
                      {typeName.get(c.training_type_id) ?? "Training"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.completed_on}</TableCell>
                    <TableCell className="font-mono text-xs">{c.expires_on ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-[#2a2e3d] text-[#8b8fa3]">
                        {c.source}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-[#8b8fa3]">
                    No completions yet. Import history or record a class.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-[#e8eaed] mb-4">Exemptions</h2>
        {exemptions && exemptions.length > 0 ? (
          <div className="rounded-lg border border-[#2a2e3d] overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-[#1a1d27] text-[#8b8fa3]">
                <tr>
                  <th className="px-4 py-2 text-left">Training</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                  <th className="px-4 py-2 text-left">Expires</th>
                  <th className="px-4 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2e3d]">
                {exemptions.map((ex) => (
                  <tr key={ex.id}>
                    <td className="px-4 py-2">{trainingTypeMap.get(ex.training_type_id) ?? ex.training_type_id}</td>
                    <td className="px-4 py-2 text-[#8b8fa3]">{ex.reason}</td>
                    <td className="px-4 py-2 text-[#8b8fa3]">{ex.expires_on ?? "Never"}</td>
                    <td className="px-4 py-2">
                      <form action={deleteExemptionAction}>
                        <input type="hidden" name="exemption_id" value={ex.id} />
                        <input type="hidden" name="employee_id" value={id} />
                        <button type="submit" className="text-[#ef4444] hover:underline text-xs">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#8b8fa3] mb-4">No exemptions.</p>
        )}

        <form action={createExemptionAction} className="space-y-4 rounded-xl border border-[#2a2e3d] bg-[#1e2230] p-6">
          <h3 className="text-sm font-medium text-[#e8eaed]">Add exemption</h3>
          <input type="hidden" name="employee_id" value={id} />
          <div className="space-y-2">
            <label htmlFor="training_type_id" className="block text-sm text-[#8b8fa3]">Training type</label>
            <select
              id="training_type_id"
              name="training_type_id"
              required
              className="w-full rounded border border-[#2a2e3d] bg-[#0f1117] px-3 py-2 text-sm text-[#e8eaed]"
            >
              <option value="">Select training type...</option>
              {(trainingTypes ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="reason" className="block text-sm text-[#8b8fa3]">Reason</label>
            <textarea
              id="reason"
              name="reason"
              required
              rows={2}
              className="w-full rounded border border-[#2a2e3d] bg-[#0f1117] px-3 py-2 text-sm text-[#e8eaed]"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="expires_on" className="block text-sm text-[#8b8fa3]">Expires (optional)</label>
            <input
              id="expires_on"
              name="expires_on"
              type="date"
              className="rounded border border-[#2a2e3d] bg-[#0f1117] px-3 py-2 text-sm text-[#e8eaed]"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm text-white hover:bg-[#2563eb]"
          >
            Add exemption
          </button>
        </form>
      </div>
    </div>
  );
}
