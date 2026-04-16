import { addDays, isAfter, isBefore, isEqual, parseISO, startOfDay } from "date-fns";
import type { CompletionSource } from "@/lib/database.types";

export type ComplianceStatus =
  | "CURRENT"
  | "DUE_SOON"
  | "EXPIRED"
  | "NEVER_COMPLETED"
  | "NOT_REQUIRED"
  | "EXEMPT";

export type CompletionLite = {
  completed_on: string;
  expires_on: string | null;
  source: CompletionSource;
};

export function computeComplianceStatus(input: {
  required: boolean;
  exemptionActive: boolean;
  latestCompletion: CompletionLite | null;
  referenceDate?: Date;
}): ComplianceStatus {
  const today = startOfDay(input.referenceDate ?? new Date());
  if (!input.required) return "NOT_REQUIRED";
  if (input.exemptionActive) return "EXEMPT";
  const c = input.latestCompletion;
  if (!c) return "NEVER_COMPLETED";
  if (!c.expires_on) return "CURRENT";
  const exp = startOfDay(parseISO(c.expires_on));
  const soon = addDays(today, 30);
  if (isBefore(exp, today) && !isEqual(exp, today)) return "EXPIRED";
  if (
    (isAfter(exp, today) || isEqual(exp, today)) &&
    (isBefore(exp, soon) || isEqual(exp, soon))
  ) {
    return "DUE_SOON";
  }
  if (isAfter(exp, soon)) return "CURRENT";
  return "EXPIRED";
}

export function pickLatestCompletion(rows: CompletionLite[]): CompletionLite | null {
  if (!rows.length) return null;
  return rows.reduce((best, cur) => {
    const d = parseISO(cur.completed_on);
    const bd = parseISO(best.completed_on);
    return isAfter(d, bd) || isEqual(d, bd) ? cur : best;
  });
}
