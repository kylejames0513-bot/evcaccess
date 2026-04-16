import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
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

  const { data: rowsRaw } = await supabase
    .from("notification_queue")
    .select("id, recipient_email, subject, status, scheduled_for, sent_at")
    .eq("org_id", profile.org_id)
    .order("scheduled_for", { ascending: false })
    .limit(30);

  const rows = (rowsRaw ?? []) as {
    id: string;
    recipient_email: string;
    subject: string;
    status: string;
    scheduled_for: string;
    sent_at: string | null;
  }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-[#8b8fa3]">
          Queue rows feed the Edge Function that calls Resend or Postmark. Configure keys in Supabase secrets.
        </p>
      </div>
      <Card className="border-[#2a2e3d] bg-[#1e2230]">
        <CardHeader>
          <CardTitle className="text-base">Recent queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-[#8b8fa3]">
          {rows.length ? (
            rows.map((r) => (
              <div key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-[#2a2e3d] py-2">
                <span className="text-[#e8eaed]">{r.recipient_email}</span>
                <span>{r.status}</span>
              </div>
            ))
          ) : (
            <p>No queued messages yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
