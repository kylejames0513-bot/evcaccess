import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader, Section } from "@/components/training-hub/page-primitives";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const reports = [
    {
      title: "Compliance audit PDF",
      description: "Full employee × training matrix with status, last completion, and expiration. Formatted for regulators.",
      href: "/api/reports/compliance-pdf",
      category: "Compliance",
      format: "PDF",
    },
    {
      title: "Compliance snapshot (CSV)",
      description: "Current compliance status per employee-training pair. One row per cell in the matrix.",
      href: "/api/exports/compliance-csv",
      category: "Compliance",
      format: "CSV",
    },
    {
      title: "Attendance log (CSV)",
      description: "Every training completion on record, including source and notes.",
      href: "/api/exports/attendance-csv",
      category: "Training",
      format: "CSV",
    },
    {
      title: "Separations (CSV)",
      description: "Every departure with tenure, reasons, rehire eligibility, and FY classification.",
      href: "/api/exports/separations-csv",
      category: "Separations",
      format: "CSV",
    },
    {
      title: "Merged employees (CSV)",
      description: "Employee roster formatted for round-trip with the EVC merged sheet.",
      href: "/api/exports/merged-employees-csv",
      category: "Roster",
      format: "CSV",
    },
  ];

  const byCategory = new Map<string, typeof reports>();
  for (const r of reports) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Exports"
        title="Reports"
        subtitle="Generate PDF and CSV exports for audits, regulators, and archives."
      />

      {Array.from(byCategory.entries()).map(([category, list]) => (
        <Section key={category} label={category}>
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((r) => (
              <Link
                key={r.title}
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="panel group p-5 transition-colors hover:border-[--accent]/50 focus-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-medium group-hover:text-[--accent]">
                    {r.title}
                  </h3>
                  <span className="rounded-full bg-[--surface-alt] px-2 py-0.5 text-[10px] font-medium tracking-wide text-[--ink-muted]">
                    {r.format}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[--ink-soft]">{r.description}</p>
              </Link>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
