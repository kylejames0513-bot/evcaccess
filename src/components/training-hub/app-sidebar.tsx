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
  Inbox,
  LayoutDashboard,
  QrCode,
  Settings,
  ShieldCheck,
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

// Five tight groups, verb-first. Replaces the earlier Operate/Manage/Configure
// taxonomy so the primary actions (schedule a class, triage the inbox) are
// one click from anywhere.
const today: NavLink[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
];

const people: NavLink[] = [
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/new-hires", label: "New hires", icon: UserPlus },
  { href: "/separations", label: "Separations", icon: UserMinus },
];

const training: NavLink[] = [
  { href: "/classes", label: "Classes", icon: CalendarDays },
  { href: "/trainings", label: "Catalog", icon: BookOpen },
  { href: "/compliance", label: "Compliance", icon: ClipboardList },
  { href: "/requirements", label: "Requirements", icon: ShieldCheck },
  { href: "/attendance-log", label: "Attendance log", icon: History },
];

const operations: NavLink[] = [
  { href: "/ingestion", label: "Ingestion", icon: Database },
  { href: "/signin-queue", label: "Sign-in review", icon: ClipboardCheck },
  { href: "/review", label: "Review queue", icon: UserCircle2 },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const config: NavLink[] = [
  { href: "/settings/memos", label: "Memo templates", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ orgName, orgSlug }: { orgName: string; orgSlug: string }) {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r border-[--rule] bg-[--surface] text-[--ink]">
      <SidebarHeader className="flex h-14 shrink-0 justify-center border-b border-[--rule] px-4 py-0">
        <div className="flex items-baseline gap-2 leading-none">
          <span className="font-display text-[15px] font-medium tracking-tight text-[--ink]">
            {orgName}
          </span>
          <span className="caption">HR Hub</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <Section label="Today">
          {today.map((l) => (
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

        <Section label="People">
          {people.map((l) => (
            <NavItem key={l.href} link={l} pathname={pathname} />
          ))}
        </Section>

        <Section label="Training">
          {training.map((l) => (
            <NavItem key={l.href} link={l} pathname={pathname} />
          ))}
        </Section>

        <Section label="Operations">
          {operations.map((l) => (
            <NavItem key={l.href} link={l} pathname={pathname} />
          ))}
        </Section>

        <Section label="Configure">
          {config.map((l) => (
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
