import type { CompletionSource } from "@/lib/database.types";
import { computeComplianceStatus, pickLatestCompletion, type CompletionLite } from "@/lib/compliance";

export type MatrixEmployee = {
  id: string;
  paylocity_id: string;
  first_name: string;
  last_name: string;
  position: string;
};

export type MatrixTraining = { id: string; name: string };

export type MatrixCell = {
  status: ReturnType<typeof computeComplianceStatus>;
  latest?: CompletionLite | null;
};

export function buildComplianceMatrix(input: {
  employees: MatrixEmployee[];
  trainings: MatrixTraining[];
  requirements: { training_type_id: string; position: string | null }[];
  completions: {
    employee_id: string;
    training_type_id: string;
    completed_on: string;
    expires_on: string | null;
    source: CompletionSource;
  }[];
  exemptions: { employee_id: string; training_type_id: string; expires_on: string | null }[];
  referenceDate?: Date;
}): Map<string, Map<string, MatrixCell>> {
  const { employees, trainings, requirements, completions, exemptions, referenceDate } = input;
  const today = referenceDate ?? new Date();

  const exSet = new Set(
    exemptions
      .filter((x) => !x.expires_on || new Date(x.expires_on) >= new Date(today.toDateString()))
      .map((x) => `${x.employee_id}:${x.training_type_id}`)
  );

  const compByEmpTrain = new Map<string, CompletionLite[]>();
  for (const c of completions) {
    const k = `${c.employee_id}:${c.training_type_id}`;
    const arr = compByEmpTrain.get(k) ?? [];
    arr.push({
      completed_on: c.completed_on,
      expires_on: c.expires_on,
      source: c.source,
    });
    compByEmpTrain.set(k, arr);
  }

  const matrix = new Map<string, Map<string, MatrixCell>>();

  for (const e of employees) {
    const row = new Map<string, MatrixCell>();
    for (const t of trainings) {
      const reqs = requirements.filter((r) => r.training_type_id === t.id);
      const req =
        reqs.length === 0
          ? true
          : reqs.some(
              (r) =>
                r.position === null || r.position === "" || r.position === e.position
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
