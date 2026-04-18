-- =========================================================
-- Phase B: session_enrollments + session enhancements
-- =========================================================
-- Adds the missing "who is enrolled in this session" table so the hub
-- can build rosters, track capacity, and turn attendance into completions
-- at finalize time. Also extends sessions with optional title / kind /
-- notes columns used by the class scheduler.
-- =========================================================

-- -- sessions: optional title / kind / notes -----------------
alter table public.sessions
  add column if not exists title text,
  add column if not exists session_kind text check (session_kind in (
    'standalone','orientation','makeup','recurring_instance'
  )) default 'standalone',
  add column if not exists notes text;

create index if not exists idx_sessions_start on public.sessions(scheduled_start);
create index if not exists idx_sessions_training on public.sessions(training_id);
create index if not exists idx_sessions_status on public.sessions(status);

-- -- session_enrollments -------------------------------------
create table if not exists public.session_enrollments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  source text check (source in (
    'auto_overdue','auto_due_soon','auto_never','auto_new_hire','manual','self_signup'
  )) default 'manual',
  status text check (status in (
    'enrolled','waitlisted','confirmed','attended','no_show','excused','cancelled'
  )) default 'enrolled',
  enrolled_at timestamptz default now(),
  enrolled_by text,
  attendance_marked_at timestamptz,
  attendance_marked_by text,
  completion_id uuid references public.completions(id) on delete set null,
  notes text,
  unique (session_id, employee_id)
);

create index if not exists idx_enroll_session on public.session_enrollments(session_id);
create index if not exists idx_enroll_employee on public.session_enrollments(employee_id);
create index if not exists idx_enroll_status on public.session_enrollments(status);

alter table public.session_enrollments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'session_enrollments'
      and policyname = 'session_enrollments_auth_all'
  ) then
    create policy session_enrollments_auth_all
      on public.session_enrollments
      for all to authenticated
      using (true) with check (true);
  end if;
end $$;
