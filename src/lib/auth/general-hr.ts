/**
 * Synthetic email for the shared general HR account (Supabase email/password auth
 * requires an email-shaped identifier; it is not a real inbox).
 * Must match `supabase/seed.sql` (general_hr user).
 */
export const GENERAL_HR_AUTH_EMAIL = "general-hr@training-hub.local" as const;
