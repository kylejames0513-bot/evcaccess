-- HR user is provisioned with the Auth Admin API: `npm run db:ensure-hr-user`
-- (Raw INSERT into auth.users breaks GoTrue; see supabase/auth#1940.)
-- Kept as a no-op migration so existing project histories stay aligned.

select 1;
