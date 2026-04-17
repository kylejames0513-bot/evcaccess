-- =========================================================
-- Phase 1c: exclusions table
-- =========================================================
-- `exclusions` was referenced throughout the code (compliance page,
-- requirements actions) but no migration ever created it. Add it now
-- so the requirement-exemption feature stops failing silently.
-- =========================================================

create table if not exists public.exclusions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  role text,
  department text,
  reason text,
  created_at timestamptz default now()
);

create index if not exists idx_exclusions_training on public.exclusions(training_id);
create index if not exists idx_exclusions_role on public.exclusions(role);
create index if not exists idx_exclusions_dept on public.exclusions(department);

alter table public.exclusions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exclusions' and policyname = 'exclusions_authenticated_all'
  ) then
    create policy exclusions_authenticated_all on public.exclusions
      for all to authenticated using (true) with check (true);
  end if;
end $$;
