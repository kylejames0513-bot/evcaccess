import { getTrainingData, getComplianceIssues } from "@/lib/training-data";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { withApiHandler, ApiError } from "@/lib/api-handler";

export const GET = withApiHandler(async (request) => {
  const type = request.nextUrl.searchParams.get("type") || "department";

  const [data, issues] = await Promise.all([
    getTrainingData(),
    getComplianceIssues(),
  ]);

    if (type === "department") {
      // Compliance by division
      const divMap = new Map<string, { total: number; compliant: number; expired: number; expiring: number; needed: number; employees: Set<string> }>();

      for (const emp of data) {
        const div = emp.position || "Unknown";
        if (!divMap.has(div)) divMap.set(div, { total: 0, compliant: 0, expired: 0, expiring: 0, needed: 0, employees: new Set() });
        const entry = divMap.get(div)!;
        entry.employees.add(emp.name);

        let hasIssue = false;
        for (const t of Object.values(emp.trainings)) {
          if (t.status === "expired") { entry.expired++; hasIssue = true; }
          else if (t.status === "expiring_soon") { entry.expiring++; hasIssue = true; }
          else if (t.status === "needed") { entry.needed++; hasIssue = true; }
          entry.total++;
        }
        if (!hasIssue) entry.compliant++;
      }

      const departments = Array.from(divMap.entries()).map(([division, stats]) => ({
        division,
        employeeCount: stats.employees.size,
        totalTrainings: stats.total,
        expired: stats.expired,
        expiring: stats.expiring,
        needed: stats.needed,
        compliantEmployees: stats.compliant,
        complianceRate: stats.employees.size > 0
          ? Math.round((stats.compliant / stats.employees.size) * 100)
          : 100,
      })).sort((a, b) => a.complianceRate - b.complianceRate);

    return { departments };
    }

    if (type === "training") {
      // Completion rates per training type
      const uniqueDefs = new Map<string, typeof TRAINING_DEFINITIONS[0]>();
      for (const def of TRAINING_DEFINITIONS) {
        if (!uniqueDefs.has(def.columnKey)) uniqueDefs.set(def.columnKey, def);
      }

      const trainings = Array.from(uniqueDefs.values()).map((def) => {
        let applicable = 0;
        let completed = 0;
        let expired = 0;
        let expiring = 0;
        let needed = 0;

        for (const emp of data) {
          const t = emp.trainings[def.columnKey];
          if (!t) continue;
          if (t.status === "excused") continue;
          applicable++;
          if (t.status === "current") completed++;
          else if (t.status === "expired") expired++;
          else if (t.status === "expiring_soon") expiring++;
          else if (t.status === "needed") needed++;
        }

        return {
          name: def.name,
          columnKey: def.columnKey,
          renewalYears: def.renewalYears,
          applicable,
          completed,
          expired,
          expiring,
          needed,
          completionRate: applicable > 0 ? Math.round((completed / applicable) * 100) : 100,
        };
      }).sort((a, b) => a.completionRate - b.completionRate);

    return { trainings };
    }

    if (type === "forecast") {
      // 12-month expiration forecast
      const now = new Date();
      const months: Array<{ month: string; year: number; count: number; items: Array<{ employee: string; training: string; expirationDate: string }> }> = [];

      for (let m = 0; m < 12; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
        months.push({
          month: d.toLocaleString("default", { month: "short" }),
          year: d.getFullYear(),
          count: 0,
          items: [],
        });
      }

      // Also include overdue (past expirations)
      const overdue: Array<{ employee: string; training: string; expirationDate: string }> = [];

      for (const issue of issues) {
        if (!issue.expirationDate) continue;
        const exp = new Date(issue.expirationDate);

        if (exp < now) {
          overdue.push({ employee: issue.employee, training: issue.training, expirationDate: issue.expirationDate });
          continue;
        }

        const monthsDiff = (exp.getFullYear() - now.getFullYear()) * 12 + (exp.getMonth() - now.getMonth());
        if (monthsDiff >= 0 && monthsDiff < 12) {
          months[monthsDiff].count++;
          months[monthsDiff].items.push({
            employee: issue.employee,
            training: issue.training,
            expirationDate: issue.expirationDate,
          });
        }
      }

    return { months, overdue: { count: overdue.length, items: overdue.slice(0, 50) } };
    }

    if (type === "needs") {
      // Who-needs-what matrix
      const employeeNeeds: Array<{ employee: string; division: string; missing: Array<{ training: string; status: string }> }> = [];

      for (const emp of data) {
        const missing: Array<{ training: string; status: string }> = [];
        for (const def of TRAINING_DEFINITIONS) {
          const t = emp.trainings[def.columnKey];
          if (!t) continue;
          if (def.onlyExpired && t.status === "needed") continue;
          if (def.onlyNeeded && (t.status === "expired" || t.status === "expiring_soon") && t.date) continue;
          if (t.status === "expired" || t.status === "expiring_soon" || t.status === "needed") {
            missing.push({ training: def.name, status: t.status });
          }
        }
        if (missing.length > 0) {
          employeeNeeds.push({ employee: emp.name, division: emp.position, missing });
        }
      }

      employeeNeeds.sort((a, b) => b.missing.length - a.missing.length);

    return { employees: employeeNeeds };
  }

  throw new ApiError("Unknown report type", 400, "invalid_field");
});
