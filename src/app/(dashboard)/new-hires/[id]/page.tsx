import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type OnboardingItem = {
  key: string;
  label: string;
  type: "manual" | "training";
  blockOnboarding: boolean;
};

const NH_ITEMS: OnboardingItem[] = [
  { key: "background_check", label: "Background Check", type: "manual", blockOnboarding: true },
  { key: "relias", label: "Relias", type: "manual", blockOnboarding: true },
  { key: "three_phase", label: "3-Phase", type: "manual", blockOnboarding: true },
  { key: "job_desc", label: "Job Description", type: "manual", blockOnboarding: true },
  { key: "cpr_status", label: "CPR/FA", type: "training", blockOnboarding: true },
  { key: "med_cert_status", label: "Med Cert", type: "training", blockOnboarding: false },
  { key: "ukeru_status", label: "UKERU", type: "training", blockOnboarding: true },
  { key: "mealtime_status", label: "Mealtime", type: "training", blockOnboarding: true },
  { key: "lift_van_status", label: "Lift/Van Training", type: "training", blockOnboarding: false },
  { key: "therapy_status", label: "Therapy", type: "training", blockOnboarding: false },
  { key: "itsp_status", label: "ITSP", type: "training", blockOnboarding: false },
  { key: "delegation_status", label: "Delegation", type: "training", blockOnboarding: false },
];

const TR_ITEMS: OnboardingItem[] = [
  { key: "lift_van_status", label: "Lift/Van", type: "training", blockOnboarding: false },
  { key: "job_desc", label: "Job Desc/MOU", type: "manual", blockOnboarding: true },
  { key: "ukeru_status", label: "UKERU", type: "training", blockOnboarding: false },
  { key: "mealtime_status", label: "Mealtime", type: "training", blockOnboarding: false },
  { key: "delegation_status", label: "Delegations", type: "training", blockOnboarding: false },
  { key: "itsp_status", label: "ITSP", type: "training", blockOnboarding: false },
  { key: "therapy_status", label: "Therapies", type: "training", blockOnboarding: false },
];

const STATUS_OPTIONS = ["", "Yes", "No", "N/A", "In Progress", "Scheduled", "Pending"];

export default async function NewHireDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hire } = await supabase.from("new_hires").select("*").eq("id", id).maybeSingle();
  if (!hire) notFound();

  const isTransfer = hire.hire_type === "transfer";
  const items = isTransfer ? TR_ITEMS : NH_ITEMS;
  const hireData = hire as Record<string, unknown>;

  // Count completed onboarding items (blocking ones only)
  const blockingItems = items.filter(i => i.blockOnboarding);
  const completedBlocking = blockingItems.filter(i => {
    const val = String(hireData[i.key] ?? "").trim().toUpperCase();
    return ["YES", "Y", "PASS", "COMPLETE", "COMPLETED"].includes(val);
  }).length;
  const progress = blockingItems.length > 0 ? Math.round((completedBlocking / blockingItems.length) * 100) : 0;

  const name = hire.preferred_name
    ? `${hire.preferred_name} ${hire.legal_last_name}`
    : `${hire.legal_first_name} ${hire.legal_last_name}`;

  async function updateField(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();
    const hireId = String(formData.get("hire_id") ?? "");
    const field = String(formData.get("field") ?? "");
    const value = String(formData.get("value") ?? "");
    if (!hireId || !field) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("new_hires").update as any)({ [field]: value || null }).eq("id", hireId);
    revalidatePath(`/new-hires/${hireId}`);
  }

  async function updateStage(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();
    const hireId = String(formData.get("hire_id") ?? "");
    const stage = String(formData.get("stage") ?? "");
    if (!hireId || !stage) return;
    await supabase.from("new_hires").update({ stage, stage_entry_date: new Date().toISOString().slice(0, 10) }).eq("id", hireId);
    revalidatePath(`/new-hires/${hireId}`);
    revalidatePath("/new-hires");
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/new-hires" className="text-sm text-[--accent] hover:underline">← Pipeline</Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mb-2 ${isTransfer ? "bg-[--warn-soft] text-[--warn]" : "bg-[--accent-soft] text-[--accent]"}`}>
              {isTransfer ? "Transfer" : "New Hire"}
            </span>
            <h1 className="font-display text-[32px] font-medium leading-tight tracking-[-0.01em]">{name}</h1>
          </div>
          <div className="text-right">
            <p className="caption">Onboarding</p>
            <p className="font-display text-2xl font-medium mt-1">{progress}%</p>
            <p className="text-xs text-[--ink-muted]">{completedBlocking}/{blockingItems.length} required items</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-[--surface-alt] overflow-hidden">
        <div className="h-full rounded-full bg-[--accent] transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
        {/* Left: Profile + stage */}
        <div className="space-y-6">
          <div className="rounded-lg border border-[--rule] bg-[--surface] p-6 space-y-3">
            <p className="caption">Profile</p>
            <dl className="space-y-2 text-sm">
              <Row label="Department" value={hire.department} />
              <Row label="Position" value={hire.location_title ?? hire.position} />
              <Row label="Hire date" value={hire.offer_accepted_date ? new Date(hire.offer_accepted_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null} />
              <Row label="Month" value={hire.hire_month && hire.hire_year ? `${hire.hire_month} ${hire.hire_year}` : null} />
              {isTransfer && (
                <>
                  <Row label="From" value={hire.transfer_from} />
                  <Row label="To" value={hire.transfer_to} />
                  <Row label="MCF Received" value={hire.mcf_received_date ? new Date(hire.mcf_received_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null} />
                  <Row label="Effective" value={hire.effective_date ? new Date(hire.effective_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null} />
                </>
              )}
              <Row label="Status" value={hire.stage} />
            </dl>
          </div>

          <div className="rounded-lg border border-[--rule] bg-[--surface] p-6 space-y-3">
            <p className="caption">Stage</p>
            <form action={updateStage}>
              <input type="hidden" name="hire_id" value={hire.id} />
              <select name="stage" defaultValue={hire.stage} className="w-full rounded-md border border-[--rule] bg-[--bg] px-3 py-2 text-sm mb-2">
                <option value="offer_accepted">Offer Accepted</option>
                <option value="pre_hire_docs">Pre-Hire Docs</option>
                <option value="day_one_setup">Day One Setup</option>
                <option value="orientation">Orientation</option>
                <option value="thirty_day">30-Day Check</option>
                <option value="sixty_day">60-Day Check</option>
                <option value="ninety_day">90-Day Check</option>
                <option value="complete">Complete</option>
                <option value="withdrew">Withdrew</option>
                <option value="terminated_in_probation">Terminated in Probation</option>
              </select>
              <button type="submit" className="w-full rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--primary-foreground] hover:bg-[--accent]/90">
                Update stage
              </button>
            </form>
          </div>
        </div>

        {/* Right: Onboarding checklist */}
        <div>
          <p className="caption mb-3">
            {isTransfer ? "Transfer checklist" : "Onboarding checklist"}
          </p>
          <div className="rounded-lg border border-[--rule] bg-[--surface] divide-y divide-[--rule]">
            {items.map(item => {
              const currentVal = String(hireData[item.key] ?? "").trim();
              const isDone = ["YES", "Y", "PASS", "COMPLETE", "COMPLETED"].includes(currentVal.toUpperCase());
              const isNA = ["N/A", "NA"].includes(currentVal.toUpperCase());
              return (
                <div key={item.key} className="flex items-center gap-4 px-5 py-3">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isDone ? "bg-[--accent] text-[--primary-foreground]" :
                    isNA ? "bg-[--surface-alt] text-[--ink-muted]" :
                    "bg-[--surface-alt] text-[--ink-muted]"
                  }`}>
                    {isDone ? "✓" : isNA ? "—" : "○"}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isDone ? "text-[--accent]" : ""}`}>{item.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        item.type === "training" ? "bg-[--accent-soft] text-[--accent]" : "bg-[--surface-alt] text-[--ink-muted]"
                      }`}>
                        {item.type === "training" ? "Training" : "Manual"}
                      </span>
                      {!item.blockOnboarding && (
                        <span className="text-[10px] text-[--ink-muted]">optional</span>
                      )}
                    </div>
                  </div>
                  <form action={updateField} className="shrink-0 flex items-center gap-1">
                    <input type="hidden" name="hire_id" value={hire.id} />
                    <input type="hidden" name="field" value={item.key} />
                    <select
                      name="value"
                      defaultValue={currentVal}
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${
                        isDone ? "border-[--accent] bg-[--accent-soft] text-[--accent]" :
                        isNA ? "border-[--rule] bg-[--surface-alt] text-[--ink-muted]" :
                        currentVal === "In Progress" ? "border-[--warn] bg-[--warn-soft] text-[--warn]" :
                        "border-[--rule] bg-[--bg] text-[--ink]"
                      }`}
                    >
                      {STATUS_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt || "—"}</option>
                      ))}
                    </select>
                    <button type="submit" className="rounded border border-[--rule] px-1.5 py-1 text-[10px] text-[--ink-muted] hover:bg-[--surface-alt]">✓</button>
                  </form>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[--ink-muted] mt-2">
            Med Cert is tracked but doesn't block onboarding completion.
            Training items auto-update when synced from the Attendance Tracker.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex">
      <dt className="caption w-28 shrink-0 pt-0.5">{label}</dt>
      <dd className={value ? "text-[--ink]" : "text-[--ink-muted] italic"}>{value || "—"}</dd>
    </div>
  );
}
