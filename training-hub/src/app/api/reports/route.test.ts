import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "./route";

const listEmployeesMock = vi.hoisted(() => vi.fn());
const getTrainingDataMock = vi.hoisted(() => vi.fn());
const getComplianceIssuesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/employees", () => ({
  listEmployees: listEmployeesMock,
}));

vi.mock("@/lib/training-data", () => ({
  getTrainingData: getTrainingDataMock,
  getComplianceIssues: getComplianceIssuesMock,
}));

function buildRequest(url: string): Request & { nextUrl: URL } {
  const req = new Request(url, { method: "GET" }) as Request & { nextUrl: URL };
  req.nextUrl = new URL(url);
  return req;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

describe("GET /api/reports?type=separations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTrainingDataMock.mockResolvedValue([]);
    getComplianceIssuesMock.mockResolvedValue([]);
  });

  it("counts only dated separation events in totals and trends", async () => {
    listEmployeesMock.mockResolvedValue([
      {
        id: "dated-recent",
        first_name: "Jane",
        last_name: "Recent",
        paylocity_id: "100",
        division: "Residential",
        department: "Residential",
        position: "DSP",
        job_title: "DSP",
        hire_date: "2024-01-01",
        terminated_at: daysAgoIso(5),
        is_active: false,
      },
      {
        id: "dated-older",
        first_name: "John",
        last_name: "Older",
        paylocity_id: "101",
        division: "Residential",
        department: "Residential",
        position: "DSP",
        job_title: "DSP",
        hire_date: "2023-01-01",
        terminated_at: daysAgoIso(40),
        is_active: false,
      },
      {
        id: "inactive-missing-date",
        first_name: "Legacy",
        last_name: "NoDate",
        paylocity_id: null,
        division: null,
        department: null,
        position: null,
        job_title: null,
        hire_date: "2022-01-01",
        terminated_at: null,
        is_active: false,
      },
      {
        id: "active-employee",
        first_name: "Still",
        last_name: "Active",
        paylocity_id: "102",
        division: "Residential",
        department: "Residential",
        position: "DSP",
        job_title: "DSP",
        hire_date: "2025-01-01",
        terminated_at: null,
        is_active: true,
      },
    ]);

    const res = await GET(buildRequest("http://localhost/api/reports?type=separations") as never, undefined);
    const payload = await res.json();

    expect(payload.summary.totalSeparated).toBe(2);
    expect(payload.summary.unknownDateCount).toBe(1);
    expect(payload.summary.separatedLast30Days).toBe(1);
    expect(payload.summary.separatedLast90Days).toBe(2);
    expect(payload.byDivision[0].count).toBe(2);
    expect(payload.employees).toHaveLength(2);
  });
});
