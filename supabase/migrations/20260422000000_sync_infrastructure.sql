-- =========================================================
-- Phase D: sync infrastructure
-- =========================================================
-- Two tables used by the two-way sync layer.
--
--   sync_failures: Apps Script writeback attempts that errored.
--                  Used by the /ingestion health panel.
--
--   pending_xlsx_writes: hub edits queued for a local CLI writeback run
--                        (e.g. `npm run writeback:separations` opens the
--                        workbook, applies each pending row, marks applied).
-- =========================================================

create table if not exists public.sync_failures (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                  -- 'employee_upsert','completion_upsert','session_upsert',...
  target text not null,                -- 'google_sheet','xlsx',...
  payload jsonb not null,
  error text,
  attempts int not null default 1,
  created_at timestamptz default now(),
  last_attempt_at timestamptz default now(),
  resolved boolean default false,
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text
);
create index if not exists idx_sync_failures_unresolved
  on public.sync_failures (resolved, created_at)
  where not resolved;
create index if not exists idx_sync_failures_kind on public.sync_failures(kind);

create table if not exists public.pending_xlsx_writes (
  id uuid primary key default gen_random_uuid(),
  source text not null,                -- 'separation_summary','new_hire_tracker',...
  action text not null,                -- 'upsert','delete'
  payload jsonb not null,
  created_at timestamptz default now(),
  applied_at timestamptz,
  applied_by text,
  error text
);
create index if not exists idx_pending_xlsx_unapplied
  on public.pending_xlsx_writes (source, created_at)
  where applied_at is null;

alter table public.sync_failures enable row level security;
alter table public.pending_xlsx_writes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sync_failures'
      and policyname = 'sync_failures_auth_all'
  ) then
    create policy sync_failures_auth_all on public.sync_failures
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pending_xlsx_writes'
      and policyname = 'pending_xlsx_writes_auth_all'
  ) then
    create policy pending_xlsx_writes_auth_all on public.pending_xlsx_writes
      for all to authenticated using (true) with check (true);
  end if;
end $$;
