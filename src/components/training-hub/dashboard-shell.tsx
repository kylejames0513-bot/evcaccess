"use client";

import { usePathname } from "next/navigation";
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
      <SidebarInset className="bg-[--bg] text-[--ink]">
        <ShellHeader />
        <main className="min-w-0 flex-1 overflow-x-auto">
          <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10 md:py-10 space-y-8">
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
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[--rule] bg-[--bg] px-6">
      <SidebarTrigger className="text-[--ink-muted] hover:text-[--ink]" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-[--ink-muted]">
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[--ink-faint]">/</span>}
            <span className={i === crumbs.length - 1 ? "text-[--ink]" : ""}>{c.label}</span>
          </span>
        ))}
      </nav>
      <div className="ml-auto w-full max-w-sm">
        <CommandMenu />
      </div>
    </header>
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
