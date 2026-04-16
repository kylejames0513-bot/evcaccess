-- Training Hub: enums, tables, triggers, RLS
-- Idempotent guard for local resets: use fresh DB or adjust

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'coordinator', 'viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.employee_status as enum ('active', 'on_leave', 'terminated');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.completion_source as enum (
    'signin',
    'import_paylocity',
    'import_phs',
    'manual',
    'class_roster'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.class_status as enum (
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.enrollment_priority as enum (
    'expired',
    'never_completed',
    'expiring_soon',
    'refresher'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.pass_fail as enum ('pass', 'fail', 'no_show');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.import_source as enum ('paylocity', 'phs', 'manual_csv');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.import_run_status as enum (
    'running',
    'success',
    'partial',
    'failed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_status as enum ('pending', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  regulator text not null default '',
  fiscal_year_start_month int not null default 7
    check (fiscal_year_start_month between 1 and 12),
  logo_storage_path text,
  primary_color text,
  paylocity_field_map jsonb not null default '{}'::jsonb,
  phs_field_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles (1:1 auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  full_name text not null default '',
  role public.app_role not null default 'coordinator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create index if not exists profiles_org_id_idx on public.profiles (org_id);

-- ---------------------------------------------------------------------------
-- Auth: profile on signup (after profiles table exists)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'coordinator'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Bootstrap org (first user becomes admin)
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_organization(
  p_name text,
  p_regulator text,
  p_fiscal_month int,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and org_id is not null) then
    raise exception 'Profile already belongs to an organization';
  end if;
  insert into public.organizations (name, regulator, fiscal_year_start_month, slug)
  values (
    p_name,
    p_regulator,
    coalesce(p_fiscal_month, 7),
    lower(trim(p_slug))
  )
  returning id into v_org_id;

  update public.profiles
  set org_id = v_org_id,
      role = 'admin',
      updated_at = now()
  where id = v_uid;

  return v_org_id;
end;
$$;

grant execute on function public.bootstrap_organization(text, text, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  paylocity_id text not null,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  email text,
  position text not null default '',
  location text not null default '',
  hire_date date not null,
  termination_date date,
  status public.employee_status not null default 'active',
  supervisor_id uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, paylocity_id)
);

create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

create index if not exists employees_org_last_name_idx
  on public.employees (org_id, last_name);
create index if not exists employees_org_status_idx
  on public.employees (org_id, status);

-- ---------------------------------------------------------------------------
-- Training types
-- ---------------------------------------------------------------------------
create table if not exists public.training_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  category text not null default '',
  expiration_months int,
  is_required boolean not null default true,
  description text not null default '',
  regulatory_source text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create trigger training_types_updated_at
  before update on public.training_types
  for each row execute function public.set_updated_at();

create index if not exists training_types_org_idx on public.training_types (org_id);

-- ---------------------------------------------------------------------------
-- Training requirements
-- ---------------------------------------------------------------------------
create table if not exists public.training_requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  training_type_id uuid not null references public.training_types (id) on delete cascade,
  position text,
  due_within_days_of_hire int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger training_requirements_updated_at
  before update on public.training_requirements
  for each row execute function public.set_updated_at();

create index if not exists training_requirements_org_training_idx
  on public.training_requirements (org_id, training_type_id);

-- ---------------------------------------------------------------------------
-- Completions
-- ---------------------------------------------------------------------------
create table if not exists public.completions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  training_type_id uuid not null references public.training_types (id) on delete restrict,
  completed_on date not null,
  expires_on date,
  source public.completion_source not null,
  source_ref text,
  notes text not null default '',
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, training_type_id, completed_on, source)
);

create or replace function public.set_completion_expires_on()
returns trigger
language plpgsql
as $$
declare
  m int;
begin
  select tt.expiration_months into m
  from public.training_types tt
  where tt.id = new.training_type_id;

  if m is null then
    new.expires_on := null;
  else
    new.expires_on := (new.completed_on + make_interval(months => m))::date;
  end if;
  return new;
end;
$$;

drop trigger if exists completions_expires_on on public.completions;
create trigger completions_expires_on
  before insert or update of completed_on, training_type_id
  on public.completions
  for each row execute function public.set_completion_expires_on();

create trigger completions_updated_at
  before update on public.completions
  for each row execute function public.set_updated_at();

create index if not exists completions_org_employee_idx
  on public.completions (org_id, employee_id);
create index if not exists completions_org_training_expires_idx
  on public.completions (org_id, training_type_id, expires_on);

-- ---------------------------------------------------------------------------
-- Classes
-- ---------------------------------------------------------------------------
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  training_type_id uuid not null references public.training_types (id) on delete restrict,
  scheduled_date date not null,
  start_time time,
  end_time time,
  location text not null default '',
  instructor text not null default '',
  capacity int not null default 0,
  notes text not null default '',
  status public.class_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger classes_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

create index if not exists classes_org_date_idx on public.classes (org_id, scheduled_date);

-- ---------------------------------------------------------------------------
-- Class enrollments
-- ---------------------------------------------------------------------------
create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  priority public.enrollment_priority not null default 'refresher',
  enrolled_at timestamptz not null default now(),
  attended boolean,
  pass_fail public.pass_fail,
  left_early boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, employee_id)
);

create trigger class_enrollments_updated_at
  before update on public.class_enrollments
  for each row execute function public.set_updated_at();

create index if not exists class_enrollments_employee_idx
  on public.class_enrollments (employee_id);

-- ---------------------------------------------------------------------------
-- Sign in sessions (kiosk)
-- ---------------------------------------------------------------------------
create table if not exists public.signin_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid references public.classes (id) on delete set null,
  employee_id uuid references public.employees (id) on delete set null,
  raw_name text not null,
  raw_training text not null default '',
  arrival_time timestamptz not null default now(),
  device_info text not null default '',
  resolved boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger signin_sessions_updated_at
  before update on public.signin_sessions
  for each row execute function public.set_updated_at();

create index if not exists signin_sessions_org_idx on public.signin_sessions (org_id);

-- ---------------------------------------------------------------------------
-- Reconciliation
-- ---------------------------------------------------------------------------
create table if not exists public.unresolved_people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  raw_name text not null,
  raw_source text not null,
  source_ref text,
  reason text not null,
  suggested_employee_id uuid references public.employees (id) on delete set null,
  confidence double precision,
  resolved boolean not null default false,
  resolved_to_employee_id uuid references public.employees (id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger unresolved_people_updated_at
  before update on public.unresolved_people
  for each row execute function public.set_updated_at();

create index if not exists unresolved_people_org_resolved_idx
  on public.unresolved_people (org_id, resolved);

create table if not exists public.unknown_trainings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  raw_training_name text not null,
  raw_source text not null,
  source_ref text,
  suggested_training_type_id uuid references public.training_types (id) on delete set null,
  confidence double precision,
  resolved boolean not null default false,
  resolved_to_training_type_id uuid references public.training_types (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger unknown_trainings_updated_at
  before update on public.unknown_trainings
  for each row execute function public.set_updated_at();

create index if not exists unknown_trainings_org_resolved_idx
  on public.unknown_trainings (org_id, resolved);

create table if not exists public.name_aliases (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  alias text not null,
  created_by uuid references public.profiles (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, alias)
);

create trigger name_aliases_updated_at
  before update on public.name_aliases
  for each row execute function public.set_updated_at();

create table if not exists public.exemptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  training_type_id uuid not null references public.training_types (id) on delete cascade,
  reason text not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger exemptions_updated_at
  before update on public.exemptions
  for each row execute function public.set_updated_at();

create index if not exists exemptions_employee_training_idx
  on public.exemptions (employee_id, training_type_id);

-- ---------------------------------------------------------------------------
-- Operational
-- ---------------------------------------------------------------------------
create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  source public.import_source not null,
  filename text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status public.import_run_status not null default 'running',
  rows_processed int not null default 0,
  rows_inserted int not null default 0,
  rows_updated int not null default 0,
  rows_unresolved int not null default 0,
  triggered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger import_runs_updated_at
  before update on public.import_runs
  for each row execute function public.set_updated_at();

create index if not exists import_runs_org_started_idx
  on public.import_runs (org_id, started_at desc);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger audit_log_updated_at
  before update on public.audit_log
  for each row execute function public.set_updated_at();

create index if not exists audit_log_org_created_idx
  on public.audit_log (org_id, created_at desc);

create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  body text not null,
  template text not null default '',
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  status public.notification_status not null default 'pending',
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_queue_updated_at
  before update on public.notification_queue
  for each row execute function public.set_updated_at();

create index if not exists notification_queue_org_status_idx
  on public.notification_queue (org_id, status, scheduled_for);

-- ---------------------------------------------------------------------------
-- Recurring class templates (Phase 4)
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_class_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  training_type_id uuid not null references public.training_types (id) on delete cascade,
  name text not null,
  rule_json jsonb not null default '{}'::jsonb,
  start_time time,
  end_time time,
  location text not null default '',
  instructor text not null default '',
  capacity int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger recurring_class_templates_updated_at
  before update on public.recurring_class_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper: current user org and role (stable for policies)
-- ---------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.training_types enable row level security;
alter table public.training_requirements enable row level security;
alter table public.completions enable row level security;
alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.signin_sessions enable row level security;
alter table public.unresolved_people enable row level security;
alter table public.unknown_trainings enable row level security;
alter table public.name_aliases enable row level security;
alter table public.exemptions enable row level security;
alter table public.import_runs enable row level security;
alter table public.audit_log enable row level security;
alter table public.notification_queue enable row level security;
alter table public.recurring_class_templates enable row level security;

-- Organizations: members of org can read
create policy organizations_select_member
  on public.organizations for select
  to authenticated
  using (id = public.current_org_id());

create policy organizations_update_admin
  on public.organizations for update
  to authenticated
  using (
    id = public.current_org_id()
    and public.current_app_role() = 'admin'
  )
  with check (id = public.current_org_id());

-- Profiles
create policy profiles_select_self_or_org
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or org_id = public.current_org_id());

create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_update_org_members
  on public.profiles for update
  to authenticated
  using (
    public.current_app_role() = 'admin'
    and org_id = public.current_org_id()
    and org_id is not null
  )
  with check (
    org_id = public.current_org_id()
  );

-- Generic org table policy builders via USING (org_id = current_org_id())

-- Employees
create policy employees_select_org
  on public.employees for select
  to authenticated
  using (org_id = public.current_org_id());

create policy employees_write_admin_coord
  on public.employees for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy employees_update_admin_coord
  on public.employees for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (org_id = public.current_org_id());

-- Training types: all read; write admin only
create policy training_types_select_org
  on public.training_types for select
  to authenticated
  using (org_id = public.current_org_id());

create policy training_types_write_admin
  on public.training_types for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() = 'admin'
  );

create policy training_types_update_admin
  on public.training_types for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() = 'admin'
  )
  with check (org_id = public.current_org_id());

-- Training requirements: admin write
create policy training_requirements_select_org
  on public.training_requirements for select
  to authenticated
  using (org_id = public.current_org_id());

create policy training_requirements_write_admin
  on public.training_requirements for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() = 'admin'
  );

create policy training_requirements_update_admin
  on public.training_requirements for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() = 'admin'
  )
  with check (org_id = public.current_org_id());

create policy training_requirements_delete_admin
  on public.training_requirements for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() = 'admin'
  );

-- Completions: admin + coordinator
create policy completions_select_org
  on public.completions for select
  to authenticated
  using (org_id = public.current_org_id());

create policy completions_write_admin_coord
  on public.completions for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy completions_update_admin_coord
  on public.completions for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (org_id = public.current_org_id());

-- Classes
create policy classes_select_org
  on public.classes for select
  to authenticated
  using (org_id = public.current_org_id());

create policy classes_write_admin_coord
  on public.classes for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy classes_update_admin_coord
  on public.classes for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (org_id = public.current_org_id());

-- Class enrollments (derive org via class)
create policy class_enrollments_select_org
  on public.class_enrollments for select
  to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.id = class_enrollments.class_id
        and c.org_id = public.current_org_id()
    )
  );

create policy class_enrollments_write_admin_coord
  on public.class_enrollments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.classes c
      where c.id = class_enrollments.class_id
        and c.org_id = public.current_org_id()
    )
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy class_enrollments_update_admin_coord
  on public.class_enrollments for update
  to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.id = class_enrollments.class_id
        and c.org_id = public.current_org_id()
    )
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (
    exists (
      select 1 from public.classes c
      where c.id = class_enrollments.class_id
        and c.org_id = public.current_org_id()
    )
  );

create policy class_enrollments_delete_admin_coord
  on public.class_enrollments for delete
  to authenticated
  using (
    exists (
      select 1 from public.classes c
      where c.id = class_enrollments.class_id
        and c.org_id = public.current_org_id()
    )
    and public.current_app_role() in ('admin', 'coordinator')
  );

-- Sign in sessions
create policy signin_sessions_select_org
  on public.signin_sessions for select
  to authenticated
  using (org_id = public.current_org_id());

create policy signin_sessions_write_admin_coord
  on public.signin_sessions for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy signin_sessions_update_admin_coord
  on public.signin_sessions for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (org_id = public.current_org_id());

-- Reconciliation tables
create policy unresolved_people_all_org
  on public.unresolved_people for all
  to authenticated
  using (org_id = public.current_org_id())
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy unresolved_people_select_viewer
  on public.unresolved_people for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() = 'viewer'
  );

-- Fix: "for all" already includes select - split policies properly
-- Postgres: cannot have overlapping ALL and SELECT. Drop ALL and use granular.

drop policy if exists unresolved_people_all_org on public.unresolved_people;

create policy unresolved_people_select_org
  on public.unresolved_people for select
  to authenticated
  using (org_id = public.current_org_id());

create policy unresolved_people_write_admin_coord
  on public.unresolved_people for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy unresolved_people_update_admin_coord
  on public.unresolved_people for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (org_id = public.current_org_id());

create policy unknown_trainings_select_org
  on public.unknown_trainings for select
  to authenticated
  using (org_id = public.current_org_id());

create policy unknown_trainings_write_admin_coord
  on public.unknown_trainings for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy unknown_trainings_update_admin_coord
  on public.unknown_trainings for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (org_id = public.current_org_id());

-- Name aliases (via employee org)
create policy name_aliases_select_org
  on public.name_aliases for select
  to authenticated
  using (
    exists (
      select 1 from public.employees e
      where e.id = name_aliases.employee_id
        and e.org_id = public.current_org_id()
    )
  );

create policy name_aliases_write_admin_coord
  on public.name_aliases for insert
  to authenticated
  with check (
    exists (
      select 1 from public.employees e
      where e.id = name_aliases.employee_id
        and e.org_id = public.current_org_id()
    )
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy name_aliases_update_admin_coord
  on public.name_aliases for update
  to authenticated
  using (
    exists (
      select 1 from public.employees e
      where e.id = name_aliases.employee_id
        and e.org_id = public.current_org_id()
    )
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (
    exists (
      select 1 from public.employees e
      where e.id = name_aliases.employee_id
        and e.org_id = public.current_org_id()
    )
  );

create policy name_aliases_delete_admin_coord
  on public.name_aliases for delete
  to authenticated
  using (
    exists (
      select 1 from public.employees e
      where e.id = name_aliases.employee_id
        and e.org_id = public.current_org_id()
    )
    and public.current_app_role() in ('admin', 'coordinator')
  );

-- Exemptions
create policy exemptions_select_org
  on public.exemptions for select
  to authenticated
  using (
    exists (
      select 1 from public.employees e
      where e.id = exemptions.employee_id
        and e.org_id = public.current_org_id()
    )
  );

create policy exemptions_write_admin_coord
  on public.exemptions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.employees e
      where e.id = exemptions.employee_id
        and e.org_id = public.current_org_id()
    )
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy exemptions_update_admin_coord
  on public.exemptions for update
  to authenticated
  using (
    exists (
      select 1 from public.employees e
      where e.id = exemptions.employee_id
        and e.org_id = public.current_org_id()
    )
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (
    exists (
      select 1 from public.employees e
      where e.id = exemptions.employee_id
        and e.org_id = public.current_org_id()
    )
  );

-- Import runs
create policy import_runs_select_org
  on public.import_runs for select
  to authenticated
  using (org_id = public.current_org_id());

create policy import_runs_write_admin_coord
  on public.import_runs for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy import_runs_update_admin_coord
  on public.import_runs for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (org_id = public.current_org_id());

-- Audit log (append heavy: coordinator can insert)
create policy audit_log_select_org
  on public.audit_log for select
  to authenticated
  using (org_id = public.current_org_id());

create policy audit_log_insert_org
  on public.audit_log for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  );

-- Notification queue
create policy notification_queue_select_org
  on public.notification_queue for select
  to authenticated
  using (org_id = public.current_org_id());

create policy notification_queue_write_admin_coord
  on public.notification_queue for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  );

create policy notification_queue_update_admin_coord
  on public.notification_queue for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() in ('admin', 'coordinator')
  )
  with check (org_id = public.current_org_id());

-- Recurring templates
create policy recurring_templates_select_org
  on public.recurring_class_templates for select
  to authenticated
  using (org_id = public.current_org_id());

create policy recurring_templates_write_admin
  on public.recurring_class_templates for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_app_role() = 'admin'
  );

create policy recurring_templates_update_admin
  on public.recurring_class_templates for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() = 'admin'
  )
  with check (org_id = public.current_org_id());

create policy recurring_templates_delete_admin
  on public.recurring_class_templates for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_app_role() = 'admin'
  );

-- Viewer read only: coordinators and admins already covered; viewers need explicit deny on writes
-- Writes are already restricted by role in WITH CHECK; viewer only passes SELECT policies.

-- Service role bypasses RLS for kiosk API inserts on signin_sessions
-- Also allow service role to insert organizations if needed (not used)

comment on table public.organizations is 'Tenant root. slug used for public kiosk URL.';
-- EVC workbook import sources and completion provenance for training-matrix imports.

alter type public.import_source add value if not exists 'evc_training_xlsx';
alter type public.import_source add value if not exists 'evc_merged_employees_xlsx';

alter type public.completion_source add value if not exists 'import_evc_training';
-- HR user is provisioned with the Auth Admin API: `npm run db:ensure-hr-user`
-- (Raw INSERT into auth.users breaks GoTrue; see supabase/auth#1940.)
-- Kept as a no-op migration so existing project histories stay aligned.

select 1;
-- If an older migration inserted general-hr@training-hub.local with NULL token columns,
-- GoTrue returns "Database error querying schema" on login. Coalesce to empty strings.
-- Safe no-op when that user does not exist or columns are already non-null.

update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  recovery_token = coalesce(recovery_token, '')
where email = 'general-hr@training-hub.local';
-- Idempotent repair for Training Hub shared HR login (production drift / partial migrations).
-- Safe to run multiple times.

-- 1) GoTrue can fail login if legacy rows have NULL token columns.
update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  recovery_token = coalesce(recovery_token, '')
where lower(email) = lower('general-hr@training-hub.local');

-- 2) Default org + link profile for the general HR auth user (matches src/lib/auth/general-hr.ts).
insert into public.organizations (name, slug, regulator, fiscal_year_start_month)
values ('Emory Valley', 'emory-valley', '', 7)
on conflict (slug) do nothing;

update public.profiles p
set
  org_id = (select id from public.organizations where slug = 'emory-valley' limit 1),
  role = 'admin'::public.app_role,
  updated_at = now()
where p.id = (
  select id from auth.users where lower(email) = lower('general-hr@training-hub.local') limit 1
)
and exists (select 1 from public.organizations where slug = 'emory-valley');
-- Add department column to employees (Training sheet has "Department Description").
-- Expand training_requirements to support department + division scoping.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS employees_org_department_idx ON public.employees (org_id, department);

ALTER TABLE public.training_requirements ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.training_requirements ADD COLUMN IF NOT EXISTS division text;
-- =========================================================
-- HR Hub Core Schema
-- Single migration covering all tables from the build brief.
-- Run AFTER the existing Training Hub migrations (which create
-- organizations, profiles, and auth triggers we still depend on).
-- =========================================================

-- Extensions
create extension if not exists "pgcrypto";

-- =========================================================
-- employees: the reconciled master roster
-- =========================================================
-- Drop the old table if it exists (DB is empty per user confirmation)
drop table if exists public.class_enrollments cascade;
drop table if exists public.signin_sessions cascade;
drop table if exists public.completions cascade;
drop table if exists public.classes cascade;
drop table if exists public.exemptions cascade;
drop table if exists public.unresolved_people cascade;
drop table if exists public.unknown_trainings cascade;
drop table if exists public.name_aliases cascade;
drop table if exists public.training_requirements cascade;
drop table if exists public.training_types cascade;
drop table if exists public.import_runs cascade;
drop table if exists public.recurring_class_templates cascade;
drop table if exists public.employees cascade;

-- Drop old enums we're replacing
drop type if exists public.employee_status cascade;
drop type if exists public.completion_source cascade;
drop type if exists public.class_status cascade;
drop type if exists public.enrollment_priority cascade;
drop type if exists public.pass_fail cascade;
drop type if exists public.import_source cascade;
drop type if exists public.import_run_status cascade;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_id text unique not null,
  legal_last_name text not null,
  legal_first_name text not null,
  preferred_name text,
  known_aliases text[] default '{}',
  email text,
  phone text,
  position text,
  department text,
  location text,
  supervisor_id uuid references public.employees(id) on delete set null,
  supervisor_name_raw text,
  status text check (status in ('active','inactive','terminated','on_leave')) default 'active',
  hire_date date,
  termination_date date,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_employees_status on public.employees(status);
create index if not exists idx_employees_department on public.employees(department);
create index if not exists idx_employees_supervisor on public.employees(supervisor_id);
create index if not exists idx_employees_names on public.employees(legal_last_name, legal_first_name);

-- updated_at trigger (reuse existing or create)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- =========================================================
-- trainings: catalog of every required training
-- =========================================================
create table if not exists public.trainings (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  description text,
  category text,
  regulatory_citation text,
  cadence_type text check (cadence_type in ('one_time','monthly','annual','biennial','custom','unset')) default 'unset',
  cadence_months int,
  grace_days int default 30,
  delivery_mode text,
  materials_url text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists trainings_updated_at on public.trainings;
create trigger trainings_updated_at
  before update on public.trainings
  for each row execute function public.set_updated_at();

-- Pre-seed training catalog
insert into public.trainings (code, title, category, regulatory_citation) values
  ('CPR_FA',          'CPR & First Aid',                    'safety',     'TN DIDD Provider Manual'),
  ('UKERU',           'Ukeru (Crisis Intervention)',         'clinical',   'TN DIDD'),
  ('MEALTIME',        'Mealtime Training',                  'clinical',   'TN DIDD'),
  ('MED_TRAIN',       'Medication Administration',           'clinical',   'TN DIDD'),
  ('MED_RECERT',      'Medication Recertification',          'clinical',   'TN DIDD'),
  ('POST_MED',        'Post Medication Training',            'clinical',   'Internal'),
  ('POM',             'Positive Outcome Measures',           'clinical',   'Internal'),
  ('PERS_CENT_THNK',  'Person Centered Thinking',           'clinical',   'TN DIDD'),
  ('VR',              'Vehicle / Transportation Training',   'safety',     'Internal'),
  ('ORIENTATION',     'New Hire Orientation',                'orientation','TN DIDD'),
  ('ABUSE_NEGLECT',   'Abuse, Neglect & Exploitation',      'compliance', 'TN DIDD'),
  ('HIPAA',           'HIPAA & Confidentiality',             'compliance', 'HHS / TennCare'),
  ('BLOODBORNE',      'Bloodborne Pathogens',                'safety',     'OSHA'),
  ('FIRE_SAFETY',     'Fire Safety & Evacuation',            'safety',     'Internal'),
  ('INCIDENT_RPT',    'Incident Reporting',                  'compliance', 'TN DIDD'),
  ('CLIENT_RIGHTS',   'Client Rights & Advocacy',            'compliance', 'TN DIDD'),
  ('INFECTION_CTL',   'Infection Control',                   'safety',     'Internal'),
  ('PROF_BOUND',      'Professional Boundaries',             'compliance', 'Internal'),
  ('DOC_STANDARDS',   'Documentation Standards',             'compliance', 'TennCare MCO'),
  ('CULTURAL_COMP',   'Cultural Competency',                 'compliance', 'Internal')
on conflict (code) do nothing;

-- =========================================================
-- Function: recompute expires_on when cadence changes
-- =========================================================
create or replace function public.recompute_training_expirations(p_training_id uuid)
returns int language plpgsql as $$
declare
  v_cadence int;
  v_updated int;
begin
  select cadence_months into v_cadence
    from public.trainings where id = p_training_id;

  if v_cadence is null then
    update public.completions
       set expires_on = null
     where training_id = p_training_id;
  else
    update public.completions
       set expires_on = completed_on + (v_cadence || ' months')::interval
     where training_id = p_training_id
       and completed_on is not null;
  end if;

  get diagnostics v_updated = row_count;
  return v_updated;
end $$;

-- Trigger: auto-recompute when cadence changes
create or replace function public.trg_training_cadence_changed()
returns trigger language plpgsql as $$
begin
  if (old.cadence_months is distinct from new.cadence_months)
     or (old.cadence_type is distinct from new.cadence_type) then
    perform public.recompute_training_expirations(new.id);
    insert into public.audit_log (actor, action, entity_type, entity_id, before, after, source)
    values ('system', 'cadence_changed', 'training', new.id,
            jsonb_build_object('cadence_type', old.cadence_type, 'cadence_months', old.cadence_months),
            jsonb_build_object('cadence_type', new.cadence_type, 'cadence_months', new.cadence_months),
            'catalog_ui');
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists training_cadence_changed on public.trainings;
create trigger training_cadence_changed
  before update on public.trainings
  for each row execute function public.trg_training_cadence_changed();

-- =========================================================
-- requirements: which trainings apply to which roles
-- =========================================================
create table if not exists public.requirements (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references public.trainings(id) on delete cascade,
  role text,
  department text,
  required_within_days_of_hire int,
  created_at timestamptz default now()
);

-- =========================================================
-- completions: every training completion event
-- =========================================================
create table if not exists public.completions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  training_id uuid references public.trainings(id),
  completed_on date,
  expires_on date,
  status text check (status in ('compliant','failed','exempt','non_compliant')) default 'compliant',
  exempt_reason text,
  source text,
  source_row_hash text,
  notes text,
  certificate_url text,
  session_id uuid,
  created_at timestamptz default now()
);
create unique index if not exists idx_completions_unique on public.completions(employee_id, training_id, completed_on, source);
create index if not exists idx_completions_employee on public.completions(employee_id);
create index if not exists idx_completions_training on public.completions(training_id);
create index if not exists idx_completions_expires on public.completions(expires_on);

-- =========================================================
-- sessions: scheduled training sessions
-- =========================================================
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid references public.trainings(id),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  location text,
  trainer_name text,
  capacity int,
  status text check (status in ('scheduled','in_progress','completed','cancelled')) default 'scheduled',
  created_at timestamptz default now()
);

-- =========================================================
-- new_hires: pipeline tracking
-- =========================================================
create table if not exists public.new_hires (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id),
  legal_last_name text not null,
  legal_first_name text not null,
  preferred_name text,
  position text,
  department text,
  supervisor_id uuid references public.employees(id),
  supervisor_name_raw text,
  offer_accepted_date date,
  planned_start_date date,
  actual_start_date date,
  source text,
  recruiter text,
  stage text check (stage in (
    'offer_accepted','pre_hire_docs','day_one_setup','orientation',
    'thirty_day','sixty_day','ninety_day','complete','withdrew','terminated_in_probation'
  )) default 'offer_accepted',
  stage_entry_date date default current_date,
  probation_end_date date,
  hire_month text,
  hire_year int,
  ingest_source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_new_hires_stage on public.new_hires(stage);
create index if not exists idx_new_hires_supervisor on public.new_hires(supervisor_id);

drop trigger if exists new_hires_updated_at on public.new_hires;
create trigger new_hires_updated_at
  before update on public.new_hires
  for each row execute function public.set_updated_at();

-- =========================================================
-- new_hire_checklist
-- =========================================================
create table if not exists public.new_hire_checklist (
  id uuid primary key default gen_random_uuid(),
  new_hire_id uuid references public.new_hires(id) on delete cascade,
  stage text not null,
  item_name text not null,
  required boolean default true,
  completed boolean default false,
  completed_on date,
  completed_by text,
  doc_url text,
  notes text
);

-- =========================================================
-- separations: every departure
-- =========================================================
create table if not exists public.separations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id),
  legal_name text not null,
  position text,
  department text,
  supervisor_id uuid references public.employees(id),
  supervisor_name_raw text,
  hire_date date,
  separation_date date not null,
  tenure_days int generated always as (separation_date - hire_date) stored,
  separation_type text check (separation_type in (
    'voluntary','involuntary','layoff','retirement','end_of_contract',
    'job_abandonment','death','other'
  )),
  reason_primary text,
  reason_secondary text,
  rehire_eligible text check (rehire_eligible in ('yes','no','conditional')),
  rehire_notes text,
  exit_interview_status text check (exit_interview_status in (
    'completed','declined','scheduled','not_done'
  )) default 'not_done',
  exit_interview_doc_url text,
  final_pay_date date,
  pto_payout numeric(10,2),
  benefits_term_date date,
  cobra_mailed_date date,
  hr_notes text,
  calendar_year int generated always as (extract(year from separation_date)::int) stored,
  evc_fiscal_year int generated always as (
    case
      when extract(month from separation_date) >= 7
      then extract(year from separation_date)::int + 1
      else extract(year from separation_date)::int
    end
  ) stored,
  ingest_source text,
  created_at timestamptz default now()
);
create index if not exists idx_separations_date on public.separations(separation_date);
create index if not exists idx_separations_cy on public.separations(calendar_year);
create index if not exists idx_separations_fy on public.separations(evc_fiscal_year);
create index if not exists idx_separations_dept on public.separations(department);

-- =========================================================
-- offboarding_checklist
-- =========================================================
create table if not exists public.offboarding_checklist (
  id uuid primary key default gen_random_uuid(),
  separation_id uuid references public.separations(id) on delete cascade,
  item_name text not null,
  required boolean default true,
  completed boolean default false,
  completed_on date,
  completed_by text,
  notes text
);

-- =========================================================
-- employee_events: transfers, role changes, leave, etc.
-- =========================================================
create table if not exists public.employee_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  event_type text check (event_type in (
    'internal_transfer','role_change','department_change','supervisor_change',
    'leave_start','leave_end','rehire'
  )),
  event_date date not null,
  from_value text,
  to_value text,
  notes text,
  ingest_source text,
  created_at timestamptz default now()
);

-- =========================================================
-- ingestion_runs
-- =========================================================
create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text check (status in ('running','success','partial','failed')),
  rows_processed int default 0,
  rows_inserted int default 0,
  rows_updated int default 0,
  rows_skipped int default 0,
  rows_unresolved int default 0,
  error_summary text,
  triggered_by text
);

-- =========================================================
-- review_queue: unresolved or flagged records
-- =========================================================
create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  ingestion_run_id uuid references public.ingestion_runs(id),
  source text,
  reason text,
  raw_payload jsonb,
  suggested_match_employee_id uuid references public.employees(id),
  suggested_match_score numeric(3,2),
  resolved boolean default false,
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,
  created_at timestamptz default now()
);

-- =========================================================
-- name_aliases: learned name resolutions
-- =========================================================
create table if not exists public.name_aliases (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  alias_last text,
  alias_first text,
  source text,
  created_at timestamptz default now()
);
create index if not exists idx_aliases_names on public.name_aliases(alias_last, alias_first);

-- =========================================================
-- audit_log: append only
-- =========================================================
drop table if exists public.audit_log cascade;
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  source text,
  created_at timestamptz default now()
);
create index if not exists idx_audit_entity on public.audit_log(entity_type, entity_id);
create index if not exists idx_audit_created on public.audit_log(created_at);

-- =========================================================
-- Views
-- =========================================================
create or replace view public.vw_compliance_status as
select
  e.id as employee_id,
  e.employee_id as paylocity_id,
  e.legal_first_name,
  e.legal_last_name,
  e.department,
  e.position,
  t.id as training_id,
  t.code as training_code,
  t.title as training_title,
  t.cadence_months,
  c.completed_on,
  c.expires_on,
  case
    when t.cadence_type = 'unset' then 'cadence_not_set'
    when c.status = 'exempt' then 'exempt'
    when c.id is null then 'never_completed'
    when c.status = 'failed' then 'failed'
    when c.expires_on is null then 'compliant'
    when c.expires_on < current_date then 'overdue'
    when c.expires_on < current_date + 30 then 'due_soon'
    else 'compliant'
  end as compliance_status,
  c.expires_on - current_date as days_until_expiry
from public.employees e
cross join public.trainings t
left join lateral (
  select *
  from public.completions c2
  where c2.employee_id = e.id
    and c2.training_id = t.id
  order by c2.completed_on desc
  limit 1
) c on true
where e.status = 'active'
  and t.active = true;

create or replace view public.vw_turnover_by_fy as
select
  evc_fiscal_year,
  department,
  count(*) as separations,
  count(*) filter (where separation_type = 'voluntary') as voluntary,
  count(*) filter (where separation_type = 'involuntary') as involuntary,
  round(avg(tenure_days)::numeric, 0) as avg_tenure_days,
  round(avg(tenure_days)::numeric / 365, 2) as avg_tenure_years
from public.separations
group by evc_fiscal_year, department;

create or replace view public.vw_turnover_by_cy as
select
  calendar_year,
  department,
  count(*) as separations,
  count(*) filter (where separation_type = 'voluntary') as voluntary,
  count(*) filter (where separation_type = 'involuntary') as involuntary,
  round(avg(tenure_days)::numeric, 0) as avg_tenure_days
from public.separations
group by calendar_year, department;

-- =========================================================
-- RLS: Phase 1 — permissive for authenticated
-- =========================================================
alter table public.employees enable row level security;
alter table public.trainings enable row level security;
alter table public.requirements enable row level security;
alter table public.completions enable row level security;
alter table public.sessions enable row level security;
alter table public.new_hires enable row level security;
alter table public.new_hire_checklist enable row level security;
alter table public.separations enable row level security;
alter table public.offboarding_checklist enable row level security;
alter table public.employee_events enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.review_queue enable row level security;
alter table public.name_aliases enable row level security;
alter table public.audit_log enable row level security;

-- Permissive: authenticated users can do everything (single operator, phase 1)
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'employees','trainings','requirements','completions','sessions',
    'new_hires','new_hire_checklist','separations','offboarding_checklist',
    'employee_events','ingestion_runs','review_queue','name_aliases','audit_log'
  ]) loop
    execute format('
      create policy %I on public.%I for all to authenticated using (true) with check (true);
    ', tbl || '_authenticated_all', tbl);
  end loop;
end $$;

-- Service role bypasses RLS for ingestion scripts
