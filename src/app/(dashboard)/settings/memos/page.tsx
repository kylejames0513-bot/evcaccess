import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EmptyPanel,
  PageHeader,
  Section,
} from "@/components/training-hub/page-primitives";
import { MemoTemplateEditor } from "@/components/training-hub/memo-template-editor";
import { MemoSignoffForm } from "@/components/training-hub/memo-signoff-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemoSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: templates } = await supabase
    .from("memo_templates")
    .select("id, slug, name, subject_template, body_template, active, is_default, updated_at")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  const { data: orgs } = await supabase
    .from("organizations")
    .select("memo_signoff")
    .limit(1);
  const signoff = orgs?.[0]?.memo_signoff ?? "";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Templates"
        title="Memo Templates"
        subtitle="Plain-text memos copied from the class page. Edit once, reuse everywhere."
      />

      <Section
        label="Signoff"
        hint="Rendered as {{signoff}} in every template. Your name + title goes here."
      >
        <MemoSignoffForm initial={signoff} />
      </Section>

      <Section label={`Templates · ${templates?.length ?? 0}`}>
        {!templates || templates.length === 0 ? (
          <EmptyPanel title="No memo templates." hint="Run the migration to seed the default template." />
        ) : (
          <div className="space-y-6">
            {templates.map((t) => (
              <MemoTemplateEditor key={t.id} template={t} signoff={signoff} />
            ))}
          </div>
        )}
      </Section>

      <Section label="Available variables">
        <div className="panel p-5">
          <ul className="grid gap-2 text-sm text-[--ink-soft] md:grid-cols-2">
            <li><code>{"{{class.title}}"}</code> — e.g. &ldquo;CPR &amp; First Aid&rdquo;</li>
            <li><code>{"{{class.code}}"}</code> — e.g. &ldquo;CPR_FA&rdquo;</li>
            <li><code>{"{{class.date}}"}</code> — e.g. &ldquo;Thursday, April 23, 2026&rdquo;</li>
            <li><code>{"{{class.time}}"}</code> — e.g. &ldquo;9:00 AM – 12:00 PM&rdquo;</li>
            <li><code>{"{{class.location}}"}</code></li>
            <li><code>{"{{class.trainer}}"}</code></li>
            <li><code>{"{{attendee_count}}"}</code></li>
            <li><code>{"{{attendee_list}}"}</code> — numbered list</li>
            <li><code>{"{{signoff}}"}</code></li>
          </ul>
          <p className="mt-4 text-xs text-[--ink-muted]">
            Missing variables render as empty strings, not <code>undefined</code>. Use this to leave optional sections blank.
          </p>
        </div>
      </Section>
    </div>
  );
}
