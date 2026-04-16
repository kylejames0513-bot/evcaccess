/**
 * Synthetic email for the shared general HR account (Supabase email/password auth
 * requires an email-shaped identifier; it is not a real inbox).
 * Create/update this user with: `npm run db:ensure-hr-user` (see scripts/ensure-general-hr-user.cjs).
 */
export const GENERAL_HR_AUTH_EMAIL = "general-hr@training-hub.local" as const;
