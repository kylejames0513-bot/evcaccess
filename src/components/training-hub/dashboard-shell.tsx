"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/training-hub/app-sidebar";
import { CommandMenu } from "@/components/training-hub/command-menu";

export function DashboardShell({
  orgName,
  orgSlug,
  children,
}: {
  orgName: string;
  orgSlug: string;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar orgName={orgName} orgSlug={orgSlug} />
      <SidebarInset className="min-w-0 bg-[--bg] text-[--ink]">
        <ShellHeader />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1400px] min-w-0 space-y-6 px-4 py-6 sm:px-6 sm:py-8 md:space-y-8 md:px-10 md:py-10">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ShellHeader() {
  const pathname = usePathname();
  const crumbs = deriveCrumbs(pathname);
  // Show only the last two crumbs on mobile — full path on md+.
  const mobileCrumbs = crumbs.slice(-2);
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-[--rule] bg-[--bg]/95 px-3 backdrop-blur-sm sm:gap-3 sm:px-6">
      <SidebarTrigger className="shrink-0 text-[--ink-muted] hover:text-[--ink]" />
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-[--ink-muted]"
      >
        {/* Mobile: just the last 1–2 crumbs */}
        <span className="flex min-w-0 items-center gap-1.5 md:hidden">
          {mobileCrumbs.length > 1 && crumbs.length > 2 && (
            <span className="text-[--ink-faint]">…</span>
          )}
          {mobileCrumbs.map((c, i) => (
            <span key={c.href} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-[--ink-faint]">/</span>}
              <CrumbLink
                href={c.href}
                active={i === mobileCrumbs.length - 1}
                label={c.label}
              />
            </span>
          ))}
        </span>
        {/* md+ : full chain */}
        <span className="hidden min-w-0 items-center gap-1.5 md:flex">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-[--ink-faint]">/</span>}
              <CrumbLink
                href={c.href}
                active={i === crumbs.length - 1}
                label={c.label}
              />
            </span>
          ))}
        </span>
      </nav>
      {/* Search trigger. Icon-only on mobile, fuller pill on sm+. */}
      <div className="ml-auto flex shrink-0 items-center sm:w-[min(260px,40vw)]">
        <CommandMenu className="shrink-0 sm:w-full" />
      </div>
    </header>
  );
}

function CrumbLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  if (active) {
    return <span className="truncate text-[--ink]">{label}</span>;
  }
  return (
    <Link href={href} className="truncate hover:text-[--ink]">
      {label}
    </Link>
  );
}

function deriveCrumbs(pathname: string): Array<{ href: string; label: string }> {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ href: "/dashboard", label: "Home" }];
  return parts.map((part, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    return { href, label: humanize(part) };
  });
}

function humanize(slug: string): string {
  if (/^[0-9a-f-]{8,}$/i.test(slug)) return "Detail";
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
