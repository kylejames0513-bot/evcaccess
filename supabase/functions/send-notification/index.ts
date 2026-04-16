import { createClient } from "npm:@supabase/supabase-js@2";

type QueueRow = {
  id: string;
  org_id: string;
  recipient_email: string;
  subject: string;
  body: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from =
    Deno.env.get("NOTIFICATION_FROM_EMAIL") ?? "Training Hub <onboarding@resend.dev>";

  if (!supabaseUrl || !serviceKey) {
    return new Response("Missing Supabase env", { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: batch, error } = await admin
    .from("notification_queue")
    .select("id, org_id, recipient_email, subject, body")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .limit(25);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const rows = (batch ?? []) as QueueRow[];
  if (!rows.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!resendKey) {
    return new Response("RESEND_API_KEY not set", { status: 503 });
  }

  let sent = 0;
  for (const row of rows) {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [row.recipient_email],
        subject: row.subject,
        html: `<p>${row.body.replaceAll("\n", "<br/>")}</p>`,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      await admin
        .from("notification_queue")
        .update({
          status: "failed",
          failure_reason: t.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      continue;
    }
    await admin
      .from("notification_queue")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    sent += 1;
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
