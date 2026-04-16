import type { CompletionSource } from "@/lib/database.types";
import { computeComplianceStatus, pickLatestCompletion, type CompletionLite } from "@/lib/compliance";

export type MatrixEmployee = {
  id: string;
  employee_id: string;
  legal_first_name: string;
  legal_last_name: string;
  position: string | null;
  department: string | null;
  location: string | null;
};

export type MatrixTraining = { id: string; title: string };

export type MatrixCell = {
  status: ReturnType<typeof computeComplianceStatus>;
  latest?: CompletionLite | null;
};

export function buildComplianceMatrix(input: {
  employees: MatrixEmployee[];
  trainings: MatrixTraining[];
  requirements: { training_id: string; role: string | null; department: string | null }[];
  completions: {
    employee_id: string;
    training_id: string;
    completed_on: string;
    expires_on: string | null;
    source: CompletionSource;
    status?: string;
  }[];
  referenceDate?: Date;
}): Map<string, Map<string, MatrixCell>> {
  const { employees, trainings, requirements, completions, referenceDate } = input;
  const today = referenceDate ?? new Date();

  /* Build exempt set from completions with status='exempt' */
  const exSet = new Set(
    completions
      .filter((c) => c.status === "exempt")
      .map((c) => `${c.employee_id}:${c.training_id}`),
  );

  const compByEmpTrain = new Map<string, CompletionLite[]>();
  for (const c of completions) {
    if (c.status === "exempt") continue;
    const k = `${c.employee_id}:${c.training_id}`;
    const arr = compByEmpTrain.get(k) ?? [];
    arr.push({
      completed_on: c.completed_on,
      expires_on: c.expires_on,
      source: c.source as CompletionSource,
    });
    compByEmpTrain.set(k, arr);
  }

  const matrix = new Map<string, Map<string, MatrixCell>>();

  for (const e of employees) {
    const row = new Map<string, MatrixCell>();
    for (const t of trainings) {
      const reqs = requirements.filter((r) => r.training_id === t.id);
      const req =
        reqs.length === 0
          ? true
          : reqs.some(
              (r) =>
                (r.role === null || r.role === "" || r.role === e.position) &&
                (r.department === null || r.department === "" || r.department === e.department),
            );
      const ex = exSet.has(`${e.id}:${t.id}`);
      const list = compByEmpTrain.get(`${e.id}:${t.id}`) ?? [];
      const latest = pickLatestCompletion(list);
      const status = computeComplianceStatus({
        required: req,
        exemptionActive: ex,
        latestCompletion: latest,
        referenceDate: today,
      });
      row.set(t.id, { status, latest });
    }
    matrix.set(e.id, row);
  }
  return matrix;
}
