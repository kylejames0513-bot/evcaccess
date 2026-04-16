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
