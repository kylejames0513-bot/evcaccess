import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seedChecklistForHire } from "@/app/actions/new-hire";
import {
  PageHeader,
  SecondaryLink,
} from "@/components/training-hub/page-primitives";

export default async function NewHirePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error: errMsg } = await searchParams;

  async function createNewHire(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();

    const firstName = String(formData.get("first_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    if (!firstName || !lastName) redirect("/new-hires/new?error=Name+required");

    const hireType = String(formData.get("hire_type") ?? "new_hire");
    const isResidential = formData.get("is_residential") === "on";
    const liftVanRequired = formData.get("lift_van_required") === "on";
    const newJobDescRequired = formData.get("new_job_desc_required") === "on";

    const { data, error } = await supabase
      .from("new_hires")
      .insert({
        legal_first_name: firstName,
        legal_last_name: lastName,
        preferred_name: String(formData.get("preferred_name") ?? "").trim() || null,
        position: String(formData.get("position") ?? "").trim() || null,
        department: String(formData.get("department") ?? "").trim() || null,
        location_title: String(formData.get("location_title") ?? "").trim() || null,
        supervisor_name_raw: String(formData.get("supervisor") ?? "").trim() || null,
        planned_start_date: String(formData.get("planned_start_date") ?? "").trim() || null,
        offer_accepted_date: String(formData.get("offer_accepted_date") ?? "").trim() || null,
        source: String(formData.get("source") ?? "").trim() || null,
        hire_type: hireType === "transfer" ? "transfer" : "new_hire",
        is_residential: hireType === "transfer" ? false : isResidential,
        lift_van_required: hireType === "transfer" ? liftVanRequired : false,
        new_job_desc_required: hireType === "transfer" ? newJobDescRequired : false,
        stage: "offer_accepted",
        ingest_source: "manual",
      })
      .select("id")
      .single();

    if (error) redirect("/new-hires/new?error=" + encodeURIComponent(error.message));
    await seedChecklistForHire(data.id);
    revalidatePath("/new-hires");
    redirect(`/new-hires/${data.id}`);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Onboarding"
        title="Add a new hire"
        subtitle="Most hires come in from the tracker via the VBA push. Use this form only for one-offs."
        actions={<SecondaryLink href="/new-hires">Back to list</SecondaryLink>}
      />

      {errMsg && (
        <p className="rounded-md border border-[--alert]/30 bg-[--alert-soft] px-3 py-2 text-sm text-[--alert]">
          {errMsg}
        </p>
      )}

      <form action={createNewHire} className="max-w-xl space-y-6">
        <fieldset className="panel p-5 space-y-4">
          <legend className="caption px-2">Type</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="hire_type" value="new_hire" defaultChecked className="accent-[--accent]" />
              <span>New hire</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="hire_type" value="transfer" className="accent-[--accent]" />
              <span>Transfer</span>
            </label>
          </div>
          <div className="space-y-2 border-t border-[--rule] pt-4">
            <p className="caption">Flags</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_residential" className="h-4 w-4 accent-[--accent]" />
              <span>Residential (new hires only — adds UKERU / Mealtime / Med Cert to the checklist)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="lift_van_required" className="h-4 w-4 accent-[--accent]" />
              <span>Lift van required (transfers only)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="new_job_desc_required" className="h-4 w-4 accent-[--accent]" />
              <span>New job description required (transfers only)</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="panel p-5 space-y-4">
          <legend className="caption px-2">Identity</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <input name="first_name" required className={inputCls} />
            </Field>
            <Field label="Last name">
              <input name="last_name" required className={inputCls} />
            </Field>
          </div>
          <Field label="Preferred name">
            <input name="preferred_name" className={inputCls} placeholder="If different from legal first name" />
          </Field>
        </fieldset>

        <fieldset className="panel p-5 space-y-4">
          <legend className="caption px-2">Role</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Position">
              <input name="position" className={inputCls} />
            </Field>
            <Field label="Department">
              <input name="department" className={inputCls} />
            </Field>
          </div>
          <Field label="Location / title (raw)">
            <input name="location_title" className={inputCls} placeholder="e.g. Cedar Group Home — DSP" />
          </Field>
          <Field label="Supervisor">
            <input name="supervisor" className={inputCls} placeholder="Supervisor name" />
          </Field>
        </fieldset>

        <fieldset className="panel p-5 space-y-4">
          <legend className="caption px-2">Dates & source</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Offer accepted">
              <input type="date" name="offer_accepted_date" className={inputCls} />
            </Field>
            <Field label="Planned start">
              <input type="date" name="planned_start_date" className={inputCls} />
            </Field>
          </div>
          <Field label="Recruitment source">
            <input name="source" className={inputCls} placeholder="Indeed, referral, etc." />
          </Field>
        </fieldset>

        <button
          type="submit"
          className="inline-flex h-11 items-center rounded-md bg-[--accent] px-5 text-sm font-semibold text-[--accent-ink] transition hover:bg-[--accent-hover] focus-ring"
        >
          Create new hire
        </button>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-[--rule] bg-[--surface-alt] px-3 py-2 text-sm text-[--ink] placeholder:text-[--ink-muted]/70 focus-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="caption">{label}</span>
      {children}
    </label>
  );
}
