"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Home", section: "Today" },
  { href: "/inbox", label: "Inbox", section: "Today" },
  { href: "/employees", label: "Employees", section: "People" },
  { href: "/new-hires", label: "New hires", section: "People" },
  { href: "/separations", label: "Separations", section: "People" },
  { href: "/classes", label: "Classes", section: "Training" },
  { href: "/classes/new", label: "Schedule class", section: "Training" },
  { href: "/trainings", label: "Training catalog", section: "Training" },
  { href: "/compliance", label: "Compliance", section: "Training" },
  { href: "/requirements", label: "Requirements", section: "Training" },
  { href: "/attendance-log", label: "Attendance log", section: "Training" },
  { href: "/ingestion", label: "Ingestion", section: "Operations" },
  { href: "/signin-queue", label: "Sign-in review", section: "Operations" },
  { href: "/review", label: "Review queue", section: "Operations" },
  { href: "/analytics", label: "Analytics", section: "Operations" },
  { href: "/settings/memos", label: "Memo templates", section: "Configure" },
  { href: "/settings", label: "Settings", section: "Configure" },
];

export function CommandMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const run = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  // Group links by section for the dialog
  const grouped = links.reduce<Record<string, typeof links>>((acc, l) => {
    acc[l.section] = acc[l.section] ?? [];
    acc[l.section].push(l);
    return acc;
  }, {});

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search pages"
        className={cn(
          // Icon-only on tiny screens; becomes a full search bar from sm+.
          "inline-flex items-center gap-2 rounded-md border border-[--rule] bg-[--surface] text-sm text-[--ink-muted] transition-colors hover:border-[--accent]/30 hover:text-[--ink] focus-ring",
          "size-9 justify-center sm:h-9 sm:w-full sm:max-w-xs sm:justify-start sm:px-3 sm:py-2",
          className,
        )}
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate sm:inline">Search or jump…</span>
        <kbd className="ml-auto hidden font-mono text-[10px] text-[--ink-faint] sm:inline">
          ⌘K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {Object.entries(grouped).map(([section, items]) => (
            <CommandGroup key={section} heading={section}>
              {items.map((l) => (
                <CommandItem key={l.href} onSelect={() => run(l.href)}>
                  {l.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
