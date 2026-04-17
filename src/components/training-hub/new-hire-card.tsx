import Link from "next/link";
import { toggleChecklistItemAction } from "@/app/actions/new-hire";
import {
  isFullyOnboarded,
  templateFor,
  type HireForTemplate,
  type ItemKind,
} from "@/lib/onboarding-templates";
import { Pill } from "@/components/training-hub/page-primitives";
import { cn } from "@/lib/utils";

type Hire = HireForTemplate & {
  id: string;
  legal_first_name: string;
  legal_last_name: string;
  preferred_name: string | null;
  department: string | null;
  position: string | null;
  offer_accepted_date: string | null;
  planned_start_date: string | null;
  location_title: string | null;
};

type ChecklistRow = {
  id: string;
  item_key: string | null;
  item_name: string;
  kind: string | null;
  completed: boolean | null;
  completed_on: string | null;
};

const KIND_LABEL: Record<ItemKind, string> = {
  required: "Required",
  soft: "Soft — won't block completion",
  director: "Director-tracked",
};

const KIND_ORDER: ItemKind[] = ["required", "soft", "director"];

export function NewHireCard({
  hire,
  items,
  detailed = false,
}: {
  hire: Hire;
  items: ChecklistRow[];
  detailed?: boolean;
}) {
  const template = templateFor(hire);
  const done = new Map(items.map((i) => [i.item_key ?? "", i]));

  const requiredTotal = template.filter((t) => t.kind === "required").length;
  const requiredDone = template.filter((t) => t.kind === "required" && done.get(t.key)?.completed).length;
  const fullyOnboarded = isFullyOnboarded(hire, items);

  const name = hire.preferred_name
    ? `${hire.preferred_name} ${hire.legal_last_name}`
    : `${hire.legal_first_name} ${hire.legal_last_name}`;

  const dohStr = hire.offer_accepted_date
    ? new Date(hire.offer_accepted_date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const groups: Record<ItemKind, typeof template> = { required: [], soft: [], director: [] };
  for (const t of template) groups[t.kind].push(t);

  return (
    <div className="panel p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {detailed ? (
              <h2 className="text-lg font-medium text-[--ink]">{name}</h2>
            ) : (
              <Link href={`/new-hires/${hire.id}`} className="text-base font-medium text-[--ink] hover:text-[--accent]">
                {name}
              </Link>
            )}
            {hire.is_residential && <Pill tone="warn">Residential</Pill>}
            {fullyOnboarded && <Pill tone="success">Complete</Pill>}
          </div>
          <p className="mt-1 text-sm text-[--ink-muted]">
            {[hire.department, hire.location_title ?? hire.position].filter(Boolean).join(" · ") || "—"}
          </p>
          {dohStr && <p className="mt-0.5 text-xs text-[--ink-muted] tabular">DOH {dohStr}</p>}
        </div>
        <div className="text-right">
          <p className="caption">Required</p>
          <p className="font-display text-xl font-medium tabular">
            {requiredDone} / {requiredTotal}
          </p>
        </div>
      </header>

      <div className="mt-4 space-y-4">
        {KIND_ORDER.map((kind) => {
          const kindItems = groups[kind];
          if (kindItems.length === 0) return null;
          return (
            <div key={kind}>
              <p className="caption mb-2">{KIND_LABEL[kind]}</p>
              <div className="flex flex-wrap gap-2">
                {kindItems.map((t) => {
                  const row = done.get(t.key);
                  return (
                    <ChecklistToggle
                      key={t.key}
                      hireId={hire.id}
                      row={row}
                      label={t.label}
                      kind={kind}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChecklistToggle({
  hireId,
  row,
  label,
  kind,
}: {
  hireId: string;
  row: ChecklistRow | undefined;
  label: string;
  kind: ItemKind;
}) {
  const checked = Boolean(row?.completed);
  const disabled = !row; // item hasn't been seeded yet

  const tone =
    kind === "director"
      ? "border-[--rule] bg-[--surface-alt] text-[--ink-muted]"
      : checked
        ? "border-[--accent] bg-[--accent-soft] text-[--accent]"
        : kind === "soft"
          ? "border-[--rule] bg-[--surface] text-[--ink-soft]"
          : "border-[--rule] bg-[--surface] text-[--ink]";

  if (disabled) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
          tone,
          "opacity-60",
        )}
        title="Checklist will seed on next page load"
      >
        <span aria-hidden className="inline-block h-4 w-4 rounded border border-current"></span>
        {label}
      </span>
    );
  }

  return (
    <form action={toggleChecklistItemAction}>
      <input type="hidden" name="item_id" value={row!.id} />
      <input type="hidden" name="hire_id" value={hireId} />
      <input type="hidden" name="completed" value={checked ? "true" : "false"} />
      <button
        type="submit"
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors focus-ring",
          tone,
          "hover:border-[--accent]",
        )}
        title={row!.completed_on ? `Completed ${row!.completed_on}` : undefined}
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded border border-current text-[10px] font-bold",
            checked && "bg-current text-[--surface]",
          )}
        >
          {checked ? "✓" : ""}
        </span>
        {label}
      </button>
    </form>
  );
}
