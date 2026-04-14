import { getComplianceIssues } from "@/lib/training-data";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const { scope } = body;

  if (!scope || !["expired", "expired_expiring", "full"].includes(scope)) {
    throw new ApiError("Invalid scope", 400, "invalid_field");
  }

  const allIssues = await getComplianceIssues();

  let filtered = allIssues;
  if (scope === "expired") {
    filtered = allIssues.filter((i) => i.status === "expired");
  } else if (scope === "expired_expiring") {
    filtered = allIssues.filter((i) => i.status === "expired" || i.status === "expiring_soon");
  }

  // Build report text
  const now = new Date().toLocaleDateString();
  const lines: string[] = [];
  lines.push(`EVC Training Compliance Report — ${now}`);
  lines.push(`Scope: ${scope === "expired" ? "Expired Only" : scope === "expired_expiring" ? "Expired + Expiring" : "Full Report"}`);
  lines.push(`Total issues: ${filtered.length}`);
  lines.push("");

  const expired = filtered.filter((i) => i.status === "expired");
  const expiring = filtered.filter((i) => i.status === "expiring_soon");
  const needed = filtered.filter((i) => i.status === "needed");

  if (expired.length > 0) {
    lines.push(`── EXPIRED (${expired.length}) ──`);
    for (const i of expired) {
      lines.push(`  ${i.employee} — ${i.training}${i.expirationDate ? ` (expired ${i.expirationDate})` : ""}`);
    }
    lines.push("");
  }

  if (expiring.length > 0) {
    lines.push(`── EXPIRING SOON (${expiring.length}) ──`);
    for (const i of expiring) {
      lines.push(`  ${i.employee} — ${i.training}${i.expirationDate ? ` (expires ${i.expirationDate})` : ""}`);
    }
    lines.push("");
  }

  if (needed.length > 0) {
    lines.push(`── NEEDED (${needed.length}) ──`);
    for (const i of needed) {
      lines.push(`  ${i.employee} — ${i.training} (no date on file)`);
    }
    lines.push("");
  }

  const report = lines.join("\n");

  return {
    success: true,
    report,
    counts: {
      expired: expired.length,
      expiring: expiring.length,
      needed: needed.length,
      total: filtered.length,
    },
  };
});
