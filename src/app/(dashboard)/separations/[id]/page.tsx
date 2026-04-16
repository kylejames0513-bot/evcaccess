import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SeparationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sep } = await supabase
    .from("separations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!sep) notFound();

  const fields = [
    { label: "Name", value: sep.legal_name },
    { label: "Position", value: sep.position },
    { label: "Department", value: sep.department },
    { label: "Hire date", value: sep.hire_date ? new Date(sep.hire_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null },
    { label: "Separation date", value: sep.separation_date ? new Date(sep.separation_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null },
    { label: "Tenure", value: sep.tenure_days != null ? `${Math.round(sep.tenure_days / 365 * 10) / 10} years (${sep.tenure_days} days)` : null },
    { label: "Type", value: sep.separation_type },
    { label: "Reason", value: sep.reason_primary },
    { label: "Secondary reason", value: sep.reason_secondary },
    { label: "Rehire eligible", value: sep.rehire_eligible },
    { label: "Exit interview", value: sep.exit_interview_status },
    { label: "Calendar year", value: sep.calendar_year },
    { label: "EVC fiscal year", value: sep.evc_fiscal_year },
    { label: "HR notes", value: sep.hr_notes },
  ];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/separations" className="text-sm text-[--accent] hover:underline">&larr; All separations</Link>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em] mt-2">
          {sep.legal_name}
        </h1>
        <p className="caption mt-1">Separation record</p>
      </div>

      <div className="rounded-lg border border-[--rule] bg-[--surface] divide-y divide-[--rule]">
        {fields.map(({ label, value }) => value != null && value !== "" ? (
          <div key={label} className="flex px-6 py-3">
            <dt className="caption w-40 shrink-0 pt-0.5">{label}</dt>
            <dd className="text-sm text-[--ink]">{String(value)}</dd>
          </div>
        ) : null)}
      </div>
    </div>
  );
}
