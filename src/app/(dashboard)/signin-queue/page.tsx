import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader, SecondaryLink } from "@/components/training-hub/page-primitives";

export const dynamic = "force-dynamic";

export default async function SigninQueuePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deprecated"
        title="Sign-in Queue"
        subtitle="The sign-in queue has been replaced by the review queue."
        actions={<SecondaryLink href="/review">Open review queue →</SecondaryLink>}
      />
      <div className="panel px-6 py-10 text-center">
        <p className="font-display italic text-[--ink-muted]">
          Sign-in sessions are now routed to the review queue.
        </p>
      </div>
    </div>
  );
}
