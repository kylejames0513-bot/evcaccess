import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { ComplianceAuditDocument } from "@/pdf/compliance-audit-document";
import { loadComplianceReportRows } from "@/lib/report-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.org_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { orgName, lines } = await loadComplianceReportRows(supabase, profile.org_id);
  const generatedAt = new Date().toISOString();

  const buf = await renderToBuffer(
    <ComplianceAuditDocument orgName={orgName} generatedAt={generatedAt} lines={lines} />
  );

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="compliance-audit.pdf"`,
    },
  });
}
