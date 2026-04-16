import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SigninQueuePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold" style={{ color: "var(--ink)" }}>
          Sign-in Queue
        </h1>
        <p className="caption mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
          The sign-in queue has been replaced by the review queue.
        </p>
      </div>
      <div
        className="rounded-xl border p-8 text-center"
        style={{ borderColor: "var(--rule)", backgroundColor: "var(--surface)" }}
      >
        <p style={{ color: "var(--ink-muted)" }}>
          Sign-in sessions are now routed to the{" "}
          <a href="/review" className="underline" style={{ color: "var(--accent)" }}>
            review queue
          </a>
          .
        </p>
      </div>
    </div>
  );
}
