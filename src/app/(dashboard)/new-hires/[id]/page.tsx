import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seedChecklistForHire } from "@/app/actions/new-hire";
import { NewHireCard } from "@/components/training-hub/new-hire-card";
import { PageHeader, Pill, SecondaryLink } from "@/components/training-hub/page-primitives";

export const dynamic = "force-dynamic";

export default async function NewHireDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await seedChecklistForHire(id);

  const { data: hire } = await supabase
    .from("new_hires")
    .select(
      "id, legal_last_name, legal_first_name, preferred_name, position, department, location_title, hire_type, is_residential, lift_van_required, new_job_desc_required, stage, offer_accepted_date, planned_start_date, hire_month, hire_year",
    )
    .eq("id", id)
    .maybeSingle();

  if (!hire) notFound();

  const { data: checklist } = await supabase
    .from("new_hire_checklist")
    .select("id, new_hire_id, item_key, item_name, kind, completed, completed_on")
    .eq("new_hire_id", id);

  const name = hire.preferred_name
    ? `${hire.preferred_name} ${hire.legal_last_name}`
    : `${hire.legal_first_name} ${hire.legal_last_name}`;

  const isTransfer = hire.hire_type === "transfer";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/new-hires" className="text-sm text-[--ink-muted] hover:text-[--accent]">
          ← All new hires
        </Link>
      </div>
      <PageHeader
        eyebrow={isTransfer ? "Transfer" : "New hire"}
        title={name}
        subtitle={
          <span className="inline-flex items-center gap-2">
            {hire.is_residential && <Pill tone="warn">Residential</Pill>}
            <span>
              {[hire.department, hire.location_title ?? hire.position].filter(Boolean).join(" · ") || "—"}
            </span>
          </span>
        }
        actions={<SecondaryLink href="/new-hires">Back to list</SecondaryLink>}
      />
      <NewHireCard hire={hire} items={checklist ?? []} detailed />
    </div>
  );
}
