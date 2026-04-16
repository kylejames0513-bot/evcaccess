"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Mail,
  Settings,
  Upload,
  UserCircle2,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const operate = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/compliance", label: "Compliance", icon: ClipboardList },
  { href: "/classes", label: "Classes", icon: CalendarDays },
];

const manage = [
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/trainings", label: "Training types", icon: BookOpen },
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/review", label: "Resolution", icon: UserCircle2 },
];

const configure = [
  { href: "/notifications", label: "Notifications", icon: Mail },
  { href: "/reports", label: "Reports", icon: ClipboardList },
  { href: "/run-log", label: "Run log", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();
  const Item = ({
    href,
    label,
    icon: Icon,
  }: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={active}
          className={cn(
            active && "border-l-2 border-[#3b82f6] bg-[#1e2230]/80 text-[#e8eaed]"
          )}
          render={
            <Link href={href} className="flex w-full items-center gap-2">
              <Icon className="size-4 text-[#8b8fa3]" />
              <span>{label}</span>
            </Link>
          }
        />
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar className="border-[#2a2e3d] bg-[#1a1d27] text-[#e8eaed]">
      <SidebarHeader className="gap-2 border-b border-[#2a2e3d] px-4 py-4">
        <div className="text-sm font-semibold tracking-tight">{orgName}</div>
        <div className="text-xs text-[#8b8fa3]">Training Hub</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[#5c6078]">Operate</SidebarGroupLabel>
          <SidebarMenu>
            {operate.map((l) => (
              <Item key={l.href} {...l} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[#5c6078]">Manage</SidebarGroupLabel>
          <SidebarMenu>
            {manage.map((l) => (
              <Item key={l.href} {...l} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[#5c6078]">Configure</SidebarGroupLabel>
          <SidebarMenu>
            {configure.map((l) => (
              <Item key={l.href} {...l} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-[#2a2e3d] p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/settings/account">Account</Link>} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
