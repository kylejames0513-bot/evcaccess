import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ClassDayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select("id, training_id, scheduled_start, location, trainer_name, status")
    .eq("id", id)
    .maybeSingle();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/classes" className="text-sm text-[--accent] hover:underline">&larr; All sessions</Link>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.01em] mt-2">
          Session Details
        </h1>
      </div>
      {session ? (
        <div className="rounded-lg border border-[--rule] bg-[--surface] p-6">
          <p className="text-sm">Session ID: {session.id}</p>
          <p className="text-sm text-[--ink-muted] mt-1">Status: {session.status}</p>
          <p className="text-sm text-[--ink-muted] mt-1">Location: {session.location ?? "—"}</p>
          <p className="text-sm text-[--ink-muted] mt-1">Trainer: {session.trainer_name ?? "—"}</p>
        </div>
      ) : (
        <p className="text-[--ink-muted] font-display italic">Session not found.</p>
      )}
    </div>
  );
}
