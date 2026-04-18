-- =========================================================
-- Phase C: memo templates (plain text, copy-to-clipboard)
-- =========================================================
-- No send pipeline, no queue integration. The hub renders a memo per
-- class and copies it. Templates are editable at /settings/memos.
-- =========================================================

create table if not exists public.memo_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  subject_template text not null,
  body_template text not null,
  active boolean default true,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists one_default_memo
  on public.memo_templates ((is_default))
  where is_default;

alter table public.memo_templates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'memo_templates'
      and policyname = 'memo_templates_auth_all'
  ) then
    create policy memo_templates_auth_all on public.memo_templates
      for all to authenticated
      using (true) with check (true);
  end if;
end $$;

-- updated_at trigger (reuse existing helper)
drop trigger if exists memo_templates_updated_at on public.memo_templates;
create trigger memo_templates_updated_at
  before update on public.memo_templates
  for each row execute function public.set_updated_at();

-- Org-level memo signoff, used as {{signoff}} in templates.
alter table public.organizations
  add column if not exists memo_signoff text;

-- Seed the default template. Idempotent.
insert into public.memo_templates (slug, name, subject_template, body_template, is_default, active)
values (
  'class_memo_default',
  'Class Memo (default)',
  '{{class.title}} — {{class.date}} — {{class.time}}',
$$Hello team,

You are scheduled for {{class.title}} training:

  Date:       {{class.date}}
  Time:       {{class.time}}
  Location:   {{class.location}}
  Trainer:    {{class.trainer}}
  Training:   {{class.title}} ({{class.code}})

Attendees ({{attendee_count}}):
{{attendee_list}}

Please arrive 10 minutes early. If you cannot attend, notify HR at least
24 hours in advance.

Thank you,
{{signoff}}$$,
  true,
  true
)
on conflict (slug) do nothing;
