"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Database,
  History,
  LayoutDashboard,
  QrCode,
  Settings,
  ShieldCheck,
  Upload,
  UserCircle2,
  UserPlus,
  UserMinus,
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
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/new-hires", label: "New hires", icon: UserPlus },
  { href: "/separations", label: "Separations", icon: UserMinus },
  { href: "/compliance", label: "Compliance", icon: ClipboardList },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/attendance-log", label: "Attendance log", icon: History },
];

const manage = [
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/trainings", label: "Training catalog", icon: BookOpen },
  { href: "/requirements", label: "Requirements", icon: ShieldCheck },
  { href: "/classes", label: "Classes", icon: CalendarDays },
  { href: "/signin-queue", label: "Sign-ins", icon: ClipboardCheck },
  { href: "/imports", label: "File imports", icon: Upload },
];

const configure = [
  { href: "/ingestion", label: "Ingestion", icon: Database },
  { href: "/review", label: "Review queue", icon: UserCircle2 },
  { href: "/reports", label: "Reports", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ orgName, orgSlug }: { orgName: string; orgSlug: string }) {
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
            active && "border-l-2 border-[--accent] bg-[--accent-soft] text-[--accent] font-medium"
          )}
          render={
            <Link href={href} className="flex w-full items-center gap-2">
              <Icon className={cn("size-4", active ? "text-[--accent]" : "text-[--ink-muted]")} />
              <span>{label}</span>
            </Link>
          }
        />
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar className="border-[--rule] bg-[--surface] text-[--ink]">
      <SidebarHeader className="gap-1 border-b border-[--rule] px-4 py-4">
        <div className="font-display text-sm font-semibold tracking-tight">{orgName}</div>
        <span className="caption">HR Hub</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="caption">Operate</SidebarGroupLabel>
          <SidebarMenu>
            {operate.map((l) => (
              <Item key={l.href} {...l} />
            ))}
            {orgSlug && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <a
                      href={`/signin/${orgSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-2"
                    >
                      <QrCode className="size-4 text-[--ink-muted]" />
                      <span>Kiosk</span>
                    </a>
                  }
                />
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="caption">Manage</SidebarGroupLabel>
          <SidebarMenu>
            {manage.map((l) => (
              <Item key={l.href} {...l} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="caption">Configure</SidebarGroupLabel>
          <SidebarMenu>
            {configure.map((l) => (
              <Item key={l.href} {...l} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-[--rule] p-2">
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
