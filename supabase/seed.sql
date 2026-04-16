-- Demo / local fixtures. General HR: password `tennyson`, no email in the UI.
-- Internal auth identifier must match `src/lib/auth/general-hr.ts` (GENERAL_HR_AUTH_EMAIL).
-- Mirrors supabase/migrations/20250416120000_general_hr_gate_user.sql (idempotent).

create extension if not exists "pgcrypto";

do $$
declare
  hr_email text := 'general-hr@training-hub.local';
  v_user_id uuid;
  v_encrypted_pw text;
  inst_id uuid;
begin
  select id into inst_id from auth.instances limit 1;
  if inst_id is null then
    inst_id := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;

  if exists (select 1 from auth.users where email = hr_email) then
    null;
  else
    v_user_id := gen_random_uuid();
    v_encrypted_pw := crypt('tennyson', gen_salt('bf'));

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values (
    v_user_id,
    inst_id,
    'authenticated',
    'authenticated',
    hr_email,
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"General HR"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    v_user_id,
    format('{"sub":"%s","email":"%s"}', v_user_id::text, hr_email)::jsonb,
    'email',
    hr_email,
    now(),
    now(),
    now()
  );
  end if;
end $$;
