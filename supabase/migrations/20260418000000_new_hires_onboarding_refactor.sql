-- =========================================================
-- Phase 1d: new-hires onboarding — type + template fields
-- =========================================================
-- Adds hire_type (new_hire vs transfer) and residential flag to new_hires.
-- Adds item_key + kind to new_hire_checklist so items map to a template
-- and can be classified as required / soft / director-tracked.
-- =========================================================

alter table public.new_hires
  add column if not exists hire_type text check (hire_type in ('new_hire','transfer')) default 'new_hire',
  add column if not exists is_residential boolean default false,
  add column if not exists lift_van_required boolean default false,
  add column if not exists new_job_desc_required boolean default false;

create index if not exists idx_new_hires_hire_type on public.new_hires(hire_type);
create index if not exists idx_new_hires_residential on public.new_hires(is_residential);

alter table public.new_hire_checklist
  add column if not exists item_key text,
  add column if not exists kind text check (kind in ('required','soft','director')) default 'required';

-- stage was a NOT NULL grouping field tied to the old kanban. We keep the
-- column but drop the NOT NULL so new rows can omit it.
alter table public.new_hire_checklist
  alter column stage drop not null;

create index if not exists idx_new_hire_checklist_hire on public.new_hire_checklist(new_hire_id);
create unique index if not exists uq_new_hire_checklist_hire_key on public.new_hire_checklist(new_hire_id, item_key) where item_key is not null;
