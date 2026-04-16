"use client";

import { useMemo } from "react";
import type { MatrixCell } from "@/lib/compliance-matrix";

const colors: Record<string, string> = {
  CURRENT: "bg-[#22c55e]/20 text-[#22c55e]",
  DUE_SOON: "bg-[#f59e0b]/20 text-[#f59e0b]",
  EXPIRED: "bg-[#ef4444]/20 text-[#ef4444]",
  NEVER_COMPLETED: "bg-[#5c6078]/25 text-[#8b8fa3]",
  NOT_REQUIRED: "bg-transparent text-[#5c6078]",
  EXEMPT: "bg-[#3b82f6]/15 text-[#3b82f6]",
};

export function ComplianceMatrix({
  employees,
  trainings,
  matrix,
}: {
  employees: { id: string; paylocity_id: string; first_name: string; last_name: string }[];
  trainings: { id: string; name: string }[];
  matrix: Record<string, Record<string, MatrixCell>>;
}) {
  const flat = useMemo(() => employees, [employees]);

  return (
    <div className="overflow-auto rounded-xl border border-[#2a2e3d]">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[#2a2e3d] bg-[#1a1d27]">
            <th className="sticky left-0 z-10 border-r border-[#2a2e3d] px-3 py-2 font-medium text-[#8b8fa3]">
              Employee
            </th>
            {trainings.map((t) => (
              <th
                key={t.id}
                className="min-w-[72px] max-w-[120px] truncate border-r border-[#2a2e3d] px-2 py-2 font-medium text-[#8b8fa3]"
                title={t.name}
              >
                {t.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flat.map((e) => (
            <tr key={e.id} className="border-b border-[#2a2e3d]">
              <td className="sticky left-0 z-10 border-r border-[#2a2e3d] bg-[#0f1117] px-3 py-2 font-mono text-[11px] text-[#e8eaed]">
                <span className="block text-[10px] text-[#5c6078]">{e.paylocity_id}</span>
                {e.last_name}, {e.first_name}
              </td>
              {trainings.map((t) => {
                const cell = matrix[e.id]?.[t.id];
                const st = cell?.status ?? "NOT_REQUIRED";
                return (
                  <td key={t.id} className="border-r border-[#2a2e3d] px-1 py-1 text-center">
                    <span
                      className={`inline-block min-h-8 min-w-8 rounded-md px-1 py-2 text-[10px] font-medium ${colors[st] ?? ""}`}
                      title={st}
                    >
                      {st === "NOT_REQUIRED" ? "·" : st.slice(0, 1)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
