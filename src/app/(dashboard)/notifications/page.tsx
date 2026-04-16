import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rowsRaw } = await supabase
    .from("notification_queue")
    .select("id, recipient_email, subject, status, scheduled_for, sent_at")
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
        <h1
          className="font-display text-2xl font-semibold tracking-tight"
          style={{ color: "var(--ink)" }}
        >
          Notifications
        </h1>
        <p className="caption text-sm" style={{ color: "var(--ink-muted)" }}>
          Queue rows feed the Edge Function that calls Resend or Postmark. Configure keys in Supabase secrets.
        </p>
      </div>
      <Card style={{ borderColor: "var(--rule)", backgroundColor: "var(--surface)" }}>
        <CardHeader>
          <CardTitle className="text-base">Recent queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm" style={{ color: "var(--ink-muted)" }}>
          {rows.length ? (
            rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap justify-between gap-2 border-b py-2"
                style={{ borderColor: "var(--rule)" }}
              >
                <span style={{ color: "var(--ink)" }}>{r.recipient_email}</span>
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
