-- GoTrue reads auth.users token columns as non-NULL strings; SQL-seeded users often leave them NULL,
-- which causes "Database error querying schema" on password login.
-- See https://github.com/supabase/auth/issues/1940

update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  recovery_token = coalesce(recovery_token, '')
where email = 'general-hr@training-hub.local';
