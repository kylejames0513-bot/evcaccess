import { getTrainingData, getComplianceIssues } from "@/lib/training-data";
import { TRAINING_DEFINITIONS } from "@/config/trainings";
import { listEmployees } from "@/lib/db/employees";
import { withApiHandler, ApiError } from "@/lib/api-handler";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function parseDateOnly(dateText: string): Date | null {
  const [y, m, d] = dateText.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function diffDays(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS);
}

function getYearMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export const GET = withApiHandler(async (request) => {
  const type = request.nextUrl.searchParams.get("type") || "department";

  if (type === "separations") {
    const employees = await listEmployees({ activeOnly: false });
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfYearUtc = new Date(Date.UTC(todayUtc.getUTCFullYear(), 0, 1));
    const thisYearMonth = getYearMonth(todayUtc);

    const separationRows = employees
      .filter((emp) => !emp.is_active)
      .map((emp) => {
        const hireDate = toDateOnly(emp.hire_date);
        const separationDate = toDateOnly(emp.terminated_at);
        const hireUtc = hireDate ? parseDateOnly(hireDate) : null;
        const separationUtc = separationDate ? parseDateOnly(separationDate) : null;
        const tenureDays = hireUtc && separationUtc ? Math.max(0, diffDays(hireUtc, separationUtc)) : null;
        const daysSinceSeparation = separationUtc ? Math.max(0, diffDays(separationUtc, todayUtc)) : null;
        const separationYearMonth = separationUtc ? getYearMonth(separationUtc) : null;
        const name = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();

        return {
          id: emp.id,
          name,
          paylocityId: emp.paylocity_id,
          division: emp.division,
          department: emp.department,
          position: emp.position,
          jobTitle: emp.job_title,
          hireDate,
          separationDate,
          separationYearMonth,
          tenureDays,
          tenureYears: tenureDays == null ? null : Number((tenureDays / 365.25).toFixed(2)),
          daysSinceSeparation,
        };
      })
      .sort((a, b) => {
        if (a.separationDate && b.separationDate) {
          return b.separationDate.localeCompare(a.separationDate);
        }
        if (a.separationDate) return -1;
        if (b.separationDate) return 1;
        return a.name.localeCompare(b.name);
      });

    const datedRows = separationRows.filter((row) => row.separationDate && row.daysSinceSeparation != null);
    const last30 = datedRows.filter((row) => (row.daysSinceSeparation as number) < 30).length;
    const last90 = datedRows.filter((row) => (row.daysSinceSeparation as number) < 90).length;
    const ytd = datedRows.filter((row) => {
      if (!row.separationDate) return false;
      const parsed = parseDateOnly(row.separationDate);
      return parsed ? parsed >= startOfYearUtc : false;
    }).length;
    const thisMonth = datedRows.filter((row) => row.separationYearMonth === thisYearMonth).length;

    const tenureValues = separationRows.flatMap((row) => (row.tenureDays == null ? [] : [row.tenureDays]));
    const averageTenureDays =
      tenureValues.length > 0
        ? Math.round(tenureValues.reduce((sum, days) => sum + days, 0) / tenureValues.length)
        : null;

    const byDivisionMap = new Map<string, { count: number; tenureDaysTotal: number; tenureRows: number }>();
    const byDepartmentMap = new Map<string, number>();
    for (const row of separationRows) {
      const division = row.division || row.department || "Unknown";
      const divisionEntry = byDivisionMap.get(division) ?? { count: 0, tenureDaysTotal: 0, tenureRows: 0 };
      divisionEntry.count += 1;
      if (row.tenureDays != null) {
        divisionEntry.tenureDaysTotal += row.tenureDays;
        divisionEntry.tenureRows += 1;
      }
      byDivisionMap.set(division, divisionEntry);

      const department = row.department || "Unknown";
      byDepartmentMap.set(department, (byDepartmentMap.get(department) ?? 0) + 1);
    }

    const byDivision = Array.from(byDivisionMap.entries())
      .map(([division, entry]) => ({
        division,
        count: entry.count,
        percentOfTotal:
          separationRows.length > 0 ? Number(((entry.count / separationRows.length) * 100).toFixed(1)) : 0,
        avgTenureDays: entry.tenureRows > 0 ? Math.round(entry.tenureDaysTotal / entry.tenureRows) : null,
      }))
      .sort((a, b) => b.count - a.count || a.division.localeCompare(b.division));

    const byDepartment = Array.from(byDepartmentMap.entries())
      .map(([department, count]) => ({
        department,
        count,
        percentOfTotal:
          separationRows.length > 0 ? Number(((count / separationRows.length) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department));

    const trends = Array.from({ length: 12 }, (_, idx) => {
      const monthDate = new Date(
        Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - (11 - idx), 1)
      );
      const yearMonth = getYearMonth(monthDate);
      const count = datedRows.filter((row) => row.separationYearMonth === yearMonth).length;
      return {
        month: MONTH_NAMES[monthDate.getUTCMonth()],
        year: monthDate.getUTCFullYear(),
        yearMonth,
        count,
      };
    });

    return {
      summary: {
        totalSeparated: separationRows.length,
        separatedThisMonth: thisMonth,
        separatedLast30Days: last30,
        separatedLast90Days: last90,
        separatedYtd: ytd,
        unknownDateCount: separationRows.length - datedRows.length,
        avgTenureDays: averageTenureDays,
        avgTenureYears: averageTenureDays == null ? null : Number((averageTenureDays / 365.25).toFixed(2)),
        medianTenureDays: median(tenureValues),
      },
      trends,
      byDivision,
      byDepartment,
      employees: separationRows,
    };
  }

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
