"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  duplicateMemoTemplateAction,
  saveMemoTemplateAction,
  setDefaultMemoTemplateAction,
} from "@/app/actions/memo-template";
import { renderClassMemo, type ClassMemoInput } from "@/lib/memos/render";
import { Pill } from "@/components/training-hub/page-primitives";

type Template = {
  id: string;
  slug: string;
  name: string;
  subject_template: string;
  body_template: string;
  active: boolean | null;
  is_default: boolean | null;
  updated_at: string | null;
};

// Fake session used for live preview in the editor. Gives operators a sense of
// what the output looks like without opening an actual class page.
const FIXTURE: ClassMemoInput = {
  session: {
    scheduled_start: "2026-04-23T09:00:00",
    scheduled_end: "2026-04-23T12:00:00",
    location: "Main Office — Conference Room A",
    trainer_name: "Jane Doe",
  },
  training: { code: "CPR_FA", title: "CPR & First Aid" },
  roster: [
    {
      legal_last_name: "Smith",
      legal_first_name: "John",
      preferred_name: null,
      department: "Residential",
      location: null,
      position: "Direct Support",
    },
    {
      legal_last_name: "Thompson",
      legal_first_name: "Mary",
      preferred_name: "Cindy",
      department: "Residential",
      location: null,
      position: "Direct Support",
    },
    {
      legal_last_name: "Patel",
      legal_first_name: "Amita",
      preferred_name: null,
      department: "Day Services",
      location: null,
      position: "Direct Support",
    },
  ],
  signoff: null,
};

export function MemoTemplateEditor({
  template,
  signoff,
}: {
  template: Template;
  signoff: string;
}) {
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject_template);
  const [body, setBody] = useState(template.body_template);
  const [active, setActive] = useState(template.active ?? true);
  const [isSaving, startSave] = useTransition();
  const [isSwapping, startSwap] = useTransition();
  const [isDuping, startDupe] = useTransition();
  const router = useRouter();

  const dirty =
    name !== template.name ||
    subject !== template.subject_template ||
    body !== template.body_template ||
    active !== (template.active ?? true);

  const preview = useMemo(() => {
    try {
      const out = renderClassMemo(
        { subject_template: subject, body_template: body },
        { ...FIXTURE, signoff: signoff || null },
      );
      return out.plainText;
    } catch (err) {
      return `(render error: ${String(err)})`;
    }
  }, [subject, body, signoff]);

  function save() {
    const form = new FormData();
    form.set("id", template.id);
    form.set("name", name);
    form.set("subject_template", subject);
    form.set("body_template", body);
    form.set("active", active ? "true" : "false");
    startSave(async () => {
      await saveMemoTemplateAction(form);
      toast.success(`Saved "${name}".`);
      router.refresh();
    });
  }

  function makeDefault() {
    const form = new FormData();
    form.set("id", template.id);
    startSwap(async () => {
      await setDefaultMemoTemplateAction(form);
      toast.success(`"${template.name}" is now the default.`);
      router.refresh();
    });
  }

  function duplicate() {
    const form = new FormData();
    form.set("id", template.id);
    startDupe(async () => {
      await duplicateMemoTemplateAction(form);
      toast.success("Duplicated.");
      router.refresh();
    });
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--rule] bg-[--surface-alt] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input h-8 w-auto min-w-[220px] py-0 text-sm font-medium"
          />
          {template.is_default ? (
            <Pill tone="success">Default</Pill>
          ) : (
            <button
              type="button"
              disabled={isSwapping}
              onClick={makeDefault}
              className="text-xs text-[--ink-muted] hover:text-[--accent]"
            >
              Make default
            </button>
          )}
          <span className="text-xs text-[--ink-muted]">·</span>
          <label className="flex items-center gap-2 text-xs text-[--ink-muted]">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="size-4 rounded border-[--rule]"
            />
            Active
          </label>
          <span className="text-xs text-[--ink-muted]">·</span>
          <span className="font-mono text-[11px] text-[--ink-muted]">{template.slug}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isDuping}
            onClick={duplicate}
            className="text-xs text-[--ink-muted] hover:text-[--ink]"
          >
            Duplicate
          </button>
          <button
            type="button"
            disabled={!dirty || isSaving}
            onClick={save}
            className="inline-flex h-8 items-center rounded-md bg-[--accent] px-3 text-xs font-medium text-[--primary-foreground] transition hover:opacity-90 disabled:opacity-40 focus-ring"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="caption">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input font-mono text-sm"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="caption">Body</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              className="input resize-y font-mono text-sm"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <p className="caption">Live preview</p>
          <pre className="m-0 max-h-[430px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[--surface-alt] p-4 text-[12px] leading-relaxed text-[--ink]">
            {preview}
          </pre>
          <p className="text-xs text-[--ink-muted]">
            Uses a fake class with 3 attendees. Real output on /classes/[id] will reflect the actual session.
          </p>
        </div>
      </div>
    </div>
  );
}
