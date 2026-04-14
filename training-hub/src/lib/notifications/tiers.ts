// ============================================================
// Notification tier classification.
// ============================================================
// Pure function. No Supabase imports. Trivially unit testable.
//
// Tier ladder per Kyle's spec:
//   overdue   : expiration_date < today
//   due_30    : 0  <  days_until <= 30
//   due_60    : 30 <  days_until <= 60
//   due_90    : 60 <  days_until <= 90
//   ok        : days_until > 90  OR  expiration_date is null (one-and-done)
//
// `due_in_30 / 60 / 90` columns on employee_compliance match this exactly.
// `days_overdue` on the same view matches the overdue path.
// ============================================================

export type NotificationTier = "overdue" | "due_30" | "due_60" | "due_90" | "ok";

export interface TierResult {
  tier: NotificationTier;
  days_until: number | null;
  days_overdue: number | null;
}

/**
 * Classify a single (expiration_date, today) pair into a tier.
 * `today` defaults to the current date in the server's local timezone.
 * Pass an explicit `today` for deterministic tests.
 */
export function classifyTier(
  expirationDate: string | Date | null | undefined,
  today: Date = new Date()
): TierResult {
  if (expirationDate == null) {
    return { tier: "ok", days_until: null, days_overdue: null };
  }

  const exp = expirationDate instanceof Date ? expirationDate : new Date(expirationDate);
  if (Number.isNaN(exp.getTime())) {
    return { tier: "ok", days_until: null, days_overdue: null };
  }

  const expMidnight = atMidnight(exp);
  const todayMidnight = atMidnight(today);
  const diffMs = expMidnight.getTime() - todayMidnight.getTime();
  const daysUntil = Math.round(diffMs / 86_400_000);

  if (daysUntil < 0) {
    return { tier: "overdue", days_until: daysUntil, days_overdue: -daysUntil };
  }
  if (daysUntil <= 30) {
    return { tier: "due_30", days_until: daysUntil, days_overdue: null };
  }
  if (daysUntil <= 60) {
    return { tier: "due_60", days_until: daysUntil, days_overdue: null };
  }
  if (daysUntil <= 90) {
    return { tier: "due_90", days_until: daysUntil, days_overdue: null };
  }
  return { tier: "ok", days_until: daysUntil, days_overdue: null };
}

/**
 * Sort key so the dashboard can order rows by urgency. Smaller = more urgent.
 *   overdue : 0
 *   due_30  : 1
 *   due_60  : 2
 *   due_90  : 3
 *   ok      : 4
 */
export function tierUrgency(tier: NotificationTier): number {
  switch (tier) {
    case "overdue":
      return 0;
    case "due_30":
      return 1;
    case "due_60":
      return 2;
    case "due_90":
      return 3;
    case "ok":
      return 4;
  }
}

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
