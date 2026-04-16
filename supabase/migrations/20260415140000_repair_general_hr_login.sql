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
