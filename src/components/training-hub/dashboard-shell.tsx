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
      <SidebarInset className="bg-[#0f1117] text-[#e8eaed]">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-[#2a2e3d] bg-[#0f1117] px-4">
          <SidebarTrigger className="text-[#e8eaed]" />
          <Separator orientation="vertical" className="h-6 bg-[#2a2e3d]" />
          <div className="flex flex-1 items-center justify-between gap-4">
            <nav className="text-sm text-[#8b8fa3]">Home</nav>
            <div className="max-w-md flex-1">
              <CommandMenu />
            </div>
            <div className="text-xs text-[#5c6078]">Training Hub</div>
          </div>
        </header>
        <div className="min-w-0 flex-1 overflow-x-auto space-y-6 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
