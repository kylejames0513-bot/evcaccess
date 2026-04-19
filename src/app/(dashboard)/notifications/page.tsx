import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EmptyPanel, PageHeader, Pill } from "@/components/training-hub/page-primitives";

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const hasRows = rows.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Outbound"
        title="Notifications"
        subtitle="Queue rows feed the edge function that calls Resend. Configure keys in Supabase secrets."
      />

      {!hasRows ? (
        <EmptyPanel title="No queued messages yet." />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[--rule]">
                <th className="caption px-4 py-3 text-left">Recipient</th>
                <th className="caption px-4 py-3 text-left">Subject</th>
                <th className="caption px-4 py-3 text-left">Status</th>
                <th className="caption px-4 py-3 text-left">Scheduled</th>
                <th className="caption px-4 py-3 text-left">Sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="row-hover border-b border-[--rule] last:border-0">
                  <td className="px-4 py-3 text-[--ink]">{r.recipient_email}</td>
                  <td className="px-4 py-3 text-[--ink-soft]">{r.subject}</td>
                  <td className="px-4 py-3">
                    <Pill
                      tone={
                        r.status === "sent"
                          ? "success"
                          : r.status === "failed"
                            ? "alert"
                            : r.status === "pending"
                              ? "warn"
                              : "muted"
                      }
                    >
                      {r.status}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 tabular text-[--ink-muted]">
                    {r.scheduled_for ? new Date(r.scheduled_for).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 tabular text-[--ink-muted]">
                    {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
