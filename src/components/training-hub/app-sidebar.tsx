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

type NavLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const operate: NavLink[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/new-hires", label: "New hires", icon: UserPlus },
  { href: "/separations", label: "Separations", icon: UserMinus },
  { href: "/compliance", label: "Compliance", icon: ClipboardList },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/attendance-log", label: "Attendance log", icon: History },
];

const manage: NavLink[] = [
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/trainings", label: "Training catalog", icon: BookOpen },
  { href: "/requirements", label: "Requirements", icon: ShieldCheck },
  { href: "/classes", label: "Classes", icon: CalendarDays },
  { href: "/signin-queue", label: "Sign-ins", icon: ClipboardCheck },
  { href: "/imports", label: "File imports", icon: Upload },
];

const configure: NavLink[] = [
  { href: "/ingestion", label: "Ingestion", icon: Database },
  { href: "/review", label: "Review queue", icon: UserCircle2 },
  { href: "/reports", label: "Reports", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ orgName, orgSlug }: { orgName: string; orgSlug: string }) {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r border-[--rule] bg-[--surface] text-[--ink]">
      <SidebarHeader className="gap-0.5 border-b border-[--rule] px-4 py-5">
        <div className="font-display text-[15px] font-medium tracking-tight text-[--ink]">
          {orgName}
        </div>
        <span className="caption">HR Hub</span>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <Section label="Operate">
          {operate.map((l) => (
            <NavItem key={l.href} link={l} pathname={pathname} />
          ))}
          {orgSlug && (
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-[--ink-soft] hover:bg-[--surface-alt] hover:text-[--ink]"
                render={
                  <a
                    href={`/signin/${orgSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center gap-2.5"
                  >
                    <QrCode className="size-4 text-[--ink-muted]" />
                    <span>Kiosk</span>
                  </a>
                }
              />
            </SidebarMenuItem>
          )}
        </Section>

        <Section label="Manage">
          {manage.map((l) => (
            <NavItem key={l.href} link={l} pathname={pathname} />
          ))}
        </Section>

        <Section label="Configure">
          {configure.map((l) => (
            <NavItem key={l.href} link={l} pathname={pathname} />
          ))}
        </Section>
      </SidebarContent>

      <SidebarFooter className="border-t border-[--rule] p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-[--ink-muted] hover:text-[--ink]"
              render={<Link href="/settings/account">Account</Link>}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <SidebarGroup className="mb-1">
      <SidebarGroupLabel className="caption px-3 pb-1.5">{label}</SidebarGroupLabel>
      <SidebarMenu>{children}</SidebarMenu>
    </SidebarGroup>
  );
}

function NavItem({ link, pathname }: { link: NavLink; pathname: string }) {
  const { href, label, icon: Icon } = link;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        className={cn(
          "transition-colors",
          active
            ? "bg-[--accent-soft] text-[--accent] font-medium"
            : "text-[--ink-soft] hover:bg-[--surface-alt] hover:text-[--ink]"
        )}
        render={
          <Link href={href} className="flex w-full items-center gap-2.5">
            <Icon className={cn("size-4", active ? "text-[--accent]" : "text-[--ink-muted]")} />
            <span>{label}</span>
          </Link>
        }
      />
    </SidebarMenuItem>
  );
}
