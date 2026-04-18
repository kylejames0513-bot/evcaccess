/**
 * Plain-text memo rendering.
 *
 * Templates use {{variable}} and {{namespace.field}} placeholders. Missing
 * keys render as an empty string, not a literal "undefined". This is a
 * deliberate no-op on missing data — the operator sees an obvious gap and
 * can edit the template or fill in the source before copying.
 *
 * No HTML escaping: memos are plain text. Any HTML in the source flows
 * through verbatim.
 */

export type MemoContext = Record<string, string | number | null | undefined | Record<string, unknown>>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function renderTemplate(template: string, ctx: MemoContext): string {
  return template.replace(PLACEHOLDER, (_m, keyPath: string) => {
    const v = resolvePath(ctx, keyPath);
    if (v == null) return "";
    return String(v);
  });
}

function resolvePath(ctx: MemoContext, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// ----- Class memo helpers ---------------------------------------------------

export type ClassMemoInput = {
  session: {
    scheduled_start: string | null;
    scheduled_end: string | null;
    location: string | null;
    trainer_name: string | null;
  };
  training: {
    code: string | null;
    title: string | null;
  };
  roster: Array<{
    legal_last_name: string;
    legal_first_name: string;
    preferred_name: string | null;
    department: string | null;
    location: string | null;
    position: string | null;
  }>;
  signoff: string | null;
};

export type RenderedMemo = { subject: string; body: string; plainText: string };

/**
 * Produce the memo for a class. Returns both the components and a combined
 * "Subject: …\n\n<body>" string ready to dump to the clipboard.
 */
export function renderClassMemo(
  template: { subject_template: string; body_template: string },
  input: ClassMemoInput,
): RenderedMemo {
  const ctx = buildClassContext(input);
  const subject = renderTemplate(template.subject_template, ctx).trim();
  const body = renderTemplate(template.body_template, ctx);
  const plainText = `Subject: ${subject}\n\n${body}`;
  return { subject, body, plainText };
}

export function buildClassContext(input: ClassMemoInput): MemoContext {
  const startDate = input.session.scheduled_start ? new Date(input.session.scheduled_start) : null;
  const endDate = input.session.scheduled_end ? new Date(input.session.scheduled_end) : null;

  const date = startDate
    ? startDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const timeOpt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const time =
    startDate && endDate
      ? `${startDate.toLocaleTimeString("en-US", timeOpt)} – ${endDate.toLocaleTimeString("en-US", timeOpt)}`
      : startDate
        ? startDate.toLocaleTimeString("en-US", timeOpt)
        : "";

  const attendeeList = formatAttendeeList(input.roster);

  return {
    class: {
      title: input.training.title ?? "",
      code: input.training.code ?? "",
      date,
      time,
      location: input.session.location ?? "",
      trainer: input.session.trainer_name ?? "",
    },
    attendee_count: String(input.roster.length),
    attendee_list: attendeeList,
    signoff: input.signoff ?? "",
  };
}

function formatAttendeeList(roster: ClassMemoInput["roster"]): string {
  if (roster.length === 0) return "  (roster empty)";
  const width = String(roster.length).length;
  return roster
    .map((r, i) => {
      const n = String(i + 1).padStart(width, " ");
      const first =
        r.preferred_name && r.preferred_name.trim() && r.preferred_name.toLowerCase() !== r.legal_first_name.toLowerCase()
          ? `${r.legal_first_name} (${r.preferred_name})`
          : r.legal_first_name;
      const name = `${r.legal_last_name}, ${first}`;
      const deptBits = [r.department ?? r.location, r.position].filter((v): v is string => Boolean(v));
      const tail = deptBits.length > 0 ? ` — ${deptBits.join(" · ")}` : "";
      return `  ${n}. ${name}${tail}`;
    })
    .join("\n");
}
