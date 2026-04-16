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
