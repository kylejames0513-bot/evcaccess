import Link from "next/link";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warn" | "alert" | "muted";

const toneInk: Record<Tone, string> = {
  default: "text-[--ink]",
  success: "text-[--success]",
  warn: "text-[--warn]",
  alert: "text-[--alert]",
  muted: "text-[--ink-muted]",
};

const tonePillBg: Record<Tone, string> = {
  default: "bg-[--surface-alt] text-[--ink-soft]",
  success: "bg-[--success-soft] text-[--success]",
  warn: "bg-[--warn-soft] text-[--warn]",
  alert: "bg-[--alert-soft] text-[--alert]",
  muted: "bg-[--surface-alt] text-[--ink-muted]",
};

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[--rule] pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="caption">{eyebrow}</p>}
        <h1 className="mt-1">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-sm text-[--ink-soft]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: Tone;
}) {
  const body = (
    <div className="panel p-5 transition-colors hover:border-[--rule-strong]">
      <p className="caption">{label}</p>
      <p className={cn("stat-big mt-2", toneInk[tone])}>{value}</p>
      {hint && <p className="mt-2 text-xs text-[--ink-muted]">{hint}</p>}
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="focus-ring block rounded-[var(--radius)]">
      {body}
    </Link>
  );
}

export function EmptyPanel({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="font-display text-base italic text-[--ink-muted]">{title}</p>
      {hint && <p className="max-w-md text-sm text-[--ink-muted]">{hint}</p>}
      {action}
    </div>
  );
}

export function Pill({
  tone = "default",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tonePillBg[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function PrimaryLink({
  href,
  children,
  className,
  external,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}) {
  const cls = cn(
    "inline-flex items-center rounded-md bg-[--accent] px-4 py-2 text-sm font-medium text-[--accent-ink] transition-colors hover:bg-[--accent-hover] focus-ring",
    className
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function SecondaryLink({
  href,
  children,
  className,
  external,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}) {
  const cls = cn(
    "inline-flex items-center rounded-md border border-[--rule] bg-[--surface] px-4 py-2 text-sm font-medium text-[--ink] transition-colors hover:bg-[--surface-alt] focus-ring",
    className
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Section({
  label,
  children,
  action,
  hint,
}: {
  label?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  hint?: string;
}) {
  return (
    <section className="space-y-3">
      {(label || action) && (
        <div className="flex items-start justify-between gap-3">
          {(label || hint) && (
            <div>
              {label && <p className="caption">{label}</p>}
              {hint && <p className="mt-0.5 text-xs text-[--ink-muted]">{hint}</p>}
            </div>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
