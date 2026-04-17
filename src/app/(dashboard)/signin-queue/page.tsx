import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EmptyPanel,
  PageHeader,
  Pill,
  Section,
} from "@/components/training-hub/page-primitives";
import {
  listPendingSignIns,
  resolveKioskSignInAction,
} from "@/app/actions/signin-review";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SigninReviewPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { signIns, error } = await listPendingSignIns();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kiosk"
        title="Sign-in Review"
        subtitle={
          signIns.length === 0 && !error
            ? "No pending kiosk sign-ins. Marking one Pass or Failed writes it back to the Training Records sheet and (for Failed) updates the Training matrix."
            : `${signIns.length} pending sign-in${signIns.length === 1 ? "" : "s"}. Mark each Pass or Failed to write the status back to the sheet.`
        }
      />

      {error && (
        <div className="rounded-md border border-[--alert]/30 bg-[--alert-soft] px-4 py-3 text-sm text-[--alert]">
          Couldn&rsquo;t reach the Apps Script: {error}
          <p className="mt-1 text-xs text-[--ink-muted]">
            Set <code className="font-mono">GOOGLE_APPS_SCRIPT_URL</code> in Vercel or check that the
            script was redeployed after the <code className="font-mono">listPendingSignIns</code> /
            <code className="font-mono">resolveSignIn</code> actions were added.
          </p>
        </div>
      )}

      {signIns.length === 0 && !error ? (
        <EmptyPanel title="The queue is clear." hint="As kiosk sign-ins arrive, they'll show up here until you mark them." />
      ) : (
        <Section label={`Pending · ${signIns.length}`}>
          <div className="space-y-3">
            {signIns.map((row) => (
              <div key={row.id} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[--ink]">{row.attendee || "—"}</span>
                      <Pill>{row.session || "—"}</Pill>
                      {row.leftEarly === "Yes" && (
                        <Pill tone="warn">{row.reason || "Attendance issue"}</Pill>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[--ink-muted] tabular">
                      {row.date || "—"}
                      {row.arrivalTime ? ` · arrived ${row.arrivalTime}` : ""}
                    </p>
                    {row.notes && (
                      <p className="mt-2 text-sm text-[--ink-soft]">{row.notes}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <form action={resolveKioskSignInAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="result" value="Pass" />
                      <button
                        type="submit"
                        className="inline-flex h-9 items-center rounded-md bg-[--success] px-3 text-sm font-medium text-white transition hover:opacity-90 focus-ring"
                      >
                        ✓ Pass
                      </button>
                    </form>
                    <form action={resolveKioskSignInAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="result" value="Failed" />
                      <button
                        type="submit"
                        className="inline-flex h-9 items-center rounded-md border border-[--alert]/40 bg-[--alert-soft] px-3 text-sm font-medium text-[--alert] transition hover:bg-[--alert] hover:text-white focus-ring"
                      >
                        ✕ Failed
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <p className="pt-4 text-xs text-[--ink-muted]">
        How it works: the kiosk POSTs a sign-in to your Apps Script, which logs it to the <em>Training Records</em> tab
        and writes today&rsquo;s date into the <em>Training</em> matrix. Rows above are still marked <em>Pending</em> on
        the log. Clicking <strong>Pass</strong> flips the log&rsquo;s Status column; clicking <strong>Failed</strong> also
        overwrites the matrix cell with <code className="font-mono">Failed</code> so the nightly cron ingests a failed
        completion instead of a compliant date.
      </p>
    </div>
  );
}
