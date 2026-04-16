"use client";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/training-hub/app-sidebar";
import { CommandMenu } from "@/components/training-hub/command-menu";
import { Separator } from "@/components/ui/separator";

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
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-[--rule] bg-[--bg] px-6">
          <SidebarTrigger className="text-[--ink-muted]" />
          <Separator orientation="vertical" className="h-6 bg-[--rule]" />
          <div className="flex flex-1 items-center justify-between gap-4">
            <nav className="text-sm text-[--ink-muted]">Home</nav>
            <div className="max-w-md flex-1">
              <CommandMenu />
            </div>
            <span className="caption">HR Hub</span>
          </div>
        </header>
        <div className="min-w-0 flex-1 overflow-x-auto p-6 md:p-8">
          <div className="mx-auto max-w-[1400px] space-y-8">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
