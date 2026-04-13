// ============================================================
// Shared excusal reason list.
// ============================================================
// Used by both the schedule EnrolledChip (when removing someone
// from an enrollment as "excused") and the employee detail modal
// (when marking a training row as excused). Keeping one list here
// so the two UIs can't drift apart.
// ============================================================

export const EXCUSAL_REASONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "N/A", label: "N/A (General)" },
  { code: "NO_LONGER_EMPLOYEE", label: "No Longer Employee" },
  { code: "Facilities", label: "Facilities" },
  { code: "MAINT", label: "Maintenance" },
  { code: "HR", label: "HR" },
  { code: "ADMIN", label: "Admin" },
  { code: "FINANCE", label: "Finance" },
  { code: "IT", label: "IT" },
  { code: "NURSE", label: "Nurse" },
  { code: "LPN", label: "LPN" },
  { code: "RN", label: "RN" },
  { code: "DIR", label: "Director" },
  { code: "MGR", label: "Manager" },
  { code: "SUPERVISOR", label: "Supervisor" },
  { code: "TRAINER", label: "Trainer" },
  { code: "BH", label: "Behavioral Health" },
  { code: "ELC", label: "ELC" },
  { code: "EI", label: "EI" },
  { code: "BOARD", label: "Board of Directors" },
];
