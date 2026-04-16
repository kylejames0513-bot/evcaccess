import type { CompletionSource, ImportSource } from "@/lib/database.types";

export type ImportPreviewRow = {
  key: string;
  employeePaylocityId?: string;
  employeeName?: string;
  trainingName?: string;
  completedOn?: string;
  action: "insert_completion" | "noop_duplicate" | "unresolved_person" | "unknown_training";
  detail?: string;
};

export type ImportPreview = {
  source: ImportSource;
  filename: string;
  rows: ImportPreviewRow[];
  counts: {
    wouldInsert: number;
    wouldUpdate: number;
    noop: number;
    unresolvedPeople: number;
    unknownTrainings: number;
  };
};

export type NormalizedCompletionKey = {
  employeePaylocityId: string;
  trainingName: string;
  completedOn: string;
  source: CompletionSource;
};
