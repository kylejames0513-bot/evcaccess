-- Default tenant for the shared General HR account (email in src/lib/auth/general-hr.ts).
-- Idempotent: safe to re-run after db reset.

insert into public.organizations (name, slug, regulator, fiscal_year_start_month)
values ('Emory Valley', 'emory-valley', '', 7)
on conflict (slug) do nothing;

update public.profiles p
set
  org_id = (select id from public.organizations where slug = 'emory-valley' limit 1),
  role = 'admin'::public.app_role,
  updated_at = now()
where p.id = (
  select id from auth.users where email = 'general-hr@training-hub.local' limit 1
)
and exists (select 1 from public.organizations where slug = 'emory-valley');
