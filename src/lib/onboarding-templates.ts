/**
 * Onboarding checklist templates, keyed by hire_type + is_residential.
 *
 * A template item has:
 *   key     — stable identifier used to match checklist rows across
 *             re-seeds (so toggling "CPR" keeps working even if the
 *             display label changes).
 *   label   — human-readable name shown on the card.
 *   kind    — "required"  → must be completed for the hire to count
 *                           as fully onboarded.
 *             "soft"      → shown as a checkbox but not blocking
 *                           (e.g. MED_CERT — long wait list).
 *             "director"  → shown for visibility but tracked by the
 *                           program director, not HR (transfers:
 *                           DELEGATION / ITSP / THERAPIES).
 *   conditional — optional flag on the new_hires row that gates the
 *                 item (e.g. transfer with lift_van_required = true).
 */
export type ItemKind = "required" | "soft" | "director";

export type TemplateItem = {
  key: string;
  label: string;
  kind: ItemKind;
  conditional?: "lift_van_required" | "new_job_desc_required";
};

const NEW_HIRE_BASE: TemplateItem[] = [
  { key: "cpr", label: "CPR", kind: "required" },
  { key: "three_phase", label: "3-Phase", kind: "required" },
  { key: "job_desc_signed", label: "Job description signed", kind: "required" },
];

const NEW_HIRE_RESIDENTIAL: TemplateItem[] = [
  { key: "cpr", label: "CPR", kind: "required" },
  { key: "ukeru", label: "UKERU", kind: "required" },
  { key: "mealtime", label: "Mealtime", kind: "required" },
  { key: "three_phase", label: "3-Phase", kind: "required" },
  { key: "job_desc_signed", label: "Job description signed", kind: "required" },
  { key: "med_cert", label: "Med Cert", kind: "soft" },
];

const TRANSFER: TemplateItem[] = [
  { key: "ukeru", label: "UKERU", kind: "required" },
  { key: "mealtime", label: "Mealtime", kind: "required" },
  { key: "lift_van", label: "Lift van", kind: "required", conditional: "lift_van_required" },
  { key: "new_job_desc", label: "New job description", kind: "required", conditional: "new_job_desc_required" },
  { key: "delegation", label: "Delegation", kind: "director" },
  { key: "itsp", label: "ITSP", kind: "director" },
  { key: "therapies", label: "Therapies", kind: "director" },
];

export type HireForTemplate = {
  hire_type: string | null;
  is_residential: boolean | null;
  lift_van_required: boolean | null;
  new_job_desc_required: boolean | null;
};

export function templateFor(hire: HireForTemplate): TemplateItem[] {
  if (hire.hire_type === "transfer") {
    return TRANSFER.filter((item) => {
      if (!item.conditional) return true;
      return Boolean(hire[item.conditional]);
    });
  }
  return hire.is_residential ? NEW_HIRE_RESIDENTIAL : NEW_HIRE_BASE;
}

/** True if every `required` item in the template is completed. */
export function isFullyOnboarded(
  hire: HireForTemplate,
  items: Array<{ item_key: string | null; completed: boolean | null }>,
): boolean {
  const template = templateFor(hire);
  const required = template.filter((t) => t.kind === "required");
  const done = new Map(items.map((i) => [i.item_key ?? "", Boolean(i.completed)]));
  return required.every((t) => done.get(t.key) === true);
}
