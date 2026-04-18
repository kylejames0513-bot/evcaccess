import Link from "next/link";
import { redirect } from "next/navigation";
import { createClassAction } from "@/app/actions/class";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader, SecondaryLink } from "@/components/training-hub/page-primitives";

export default async function NewClassPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; training?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: types } = await supabase
    .from("trainings")
    .select("id, title, code")
    .eq("active", true)
    .order("title");

  const sp = await searchParams;
  const preselect = sp.training ?? "";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SecondaryLink href="/classes">← Back to classes</SecondaryLink>

      <PageHeader
        eyebrow="New session"
        title="Schedule a class"
        subtitle="Pick a training, date, and time. You can build the roster on the next screen."
      />

      {sp.error ? (
        <div className="rounded-md border border-[--alert]/30 bg-[--alert-soft] px-4 py-3 text-sm text-[--alert]">
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <form action={createClassAction} className="panel space-y-5 p-6">
        {/* Training */}
        <Field label="Training">
          <select
            name="training_id"
            required
            defaultValue={preselect}
            className="input"
          >
            <option value="" disabled>
              Choose a training…
            </option>
            {(types ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.code})
              </option>
            ))}
          </select>
        </Field>

        {/* Date + time */}
        <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          <Field label="Date">
            <input
              type="date"
              name="scheduled_date"
              required
              className="input"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Start time">
            <input
              type="time"
              name="start_time"
              required
              defaultValue="09:00"
              className="input"
            />
          </Field>
          <Field label="End time">
            <input
              type="time"
              name="end_time"
              defaultValue="12:00"
              className="input"
            />
          </Field>
        </div>

        {/* Kind */}
        <Field
          label="Session kind"
          hint="Orientation sessions auto-include new hires in the orientation stage."
        >
          <select name="session_kind" defaultValue="standalone" className="input">
            <option value="standalone">Standalone class</option>
            <option value="orientation">New-hire orientation</option>
            <option value="makeup">Makeup session</option>
            <option value="recurring_instance">Recurring instance</option>
          </select>
        </Field>

        {/* Location */}
        <Field label="Location">
          <input
            name="location"
            placeholder="e.g. Main Office — Conference Room A"
            className="input"
          />
        </Field>

        {/* Trainer */}
        <Field label="Trainer">
          <input name="trainer_name" placeholder="e.g. Jane Doe" className="input" />
        </Field>

        {/* Capacity */}
        <Field label="Capacity" hint="Maximum attendees. Leave blank for no limit.">
          <input
            name="capacity"
            type="number"
            min={0}
            defaultValue={12}
            className="input"
          />
        </Field>

        {/* Notes */}
        <Field label="Notes (optional)">
          <textarea
            name="notes"
            rows={3}
            className="input resize-none"
            placeholder="Anything trainers or attendees should know…"
          />
        </Field>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-md bg-[--accent] px-4 text-sm font-medium text-[--primary-foreground] transition hover:opacity-90 focus-ring"
          >
            Save session
          </button>
          <Link
            href="/classes"
            className="text-sm text-[--ink-muted] hover:text-[--ink]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="caption text-[--ink-soft]">{label}</span>
      {children}
      {hint && <span className="block text-xs text-[--ink-muted]">{hint}</span>}
    </label>
  );
}
