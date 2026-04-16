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
