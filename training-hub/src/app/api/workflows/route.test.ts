import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET as getOverview } from "./overview/route";
import { GET as getNewHires } from "./new-hires/route";
import { GET as getSeparations } from "./separations/route";
import { ApiError } from "@/lib/api-handler";

type HeadResponse = { count: number | null };

const queryBuilder = vi.hoisted(() => {
  class StubQueryBuilder {
    private readonly table: string;
    private readonly state: {
      mode: "head" | "rows";
      count: number | null;
      rows: unknown[];
    };

    constructor(
      _table: string,
      tableConfig: {
        mode: "head" | "rows";
        count?: number | null;
        rows?: unknown[];
      }
    ) {
      this.table = _table;
      this.state = {
        mode: tableConfig.mode,
        count: tableConfig.count ?? null,
        rows: tableConfig.rows ?? [],
      };
    }

    select(_columns: string, options?: { count?: "exact"; head?: boolean }) {
      if (options?.head) {
        this.state.mode = "head";
      } else {
        this.state.mode = "rows";
      }
      return this;
    }

    eq(column: string, value: unknown) {
      void column;
      void value;
      return this;
    }

    is(column: string, value: unknown) {
      void column;
      void value;
      return this;
    }

    in(column: string, value: unknown[]) {
      void column;
      void value;
      return this;
    }

    gte(column: string, value: unknown) {
      void column;
      void value;
      return this;
    }

    order(column: string, options?: { ascending?: boolean }) {
      void column;
      void options;
      return this;
    }

    limit(value: number) {
      void value;
      return Promise.resolve({
        data: this.state.mode === "rows" ? this.state.rows : null,
        count: this.state.mode === "head" ? this.state.count : null,
        error: null,
      });
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      const payload =
        this.state.mode === "head"
          ? ({ count: this.state.count, data: null, error: null } satisfies HeadResponse & {
              data: null;
              error: null;
            })
          : { data: this.state.rows, count: null, error: null };
      return Promise.resolve(payload).then(onfulfilled, onrejected);
    }
  }

  return { StubQueryBuilder };
});

const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  createServerClient: createServerClientMock,
}));

const requireHrCookieMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/hr-session", () => ({
  requireHrCookie: requireHrCookieMock,
}));

function mockDbForTables(
  tableConfig: Record<
    string,
    {
      mode: "head" | "rows";
      count?: number;
      rows?: unknown[];
    }
  >
) {
  createServerClientMock.mockReturnValue({
    from: (table: string) => {
      const config = tableConfig[table] ?? { mode: "head", count: 0 };
      return new queryBuilder.StubQueryBuilder(table, config);
    },
  });
}

function buildRequest(url: string): Request & { nextUrl: URL } {
  const req = new Request(url, { method: "GET" }) as Request & { nextUrl: URL };
  req.nextUrl = new URL(url);
  return req;
}

describe("workflow API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHrCookieMock.mockResolvedValue(undefined);
  });

  it("returns workflow overview KPI payload", async () => {
    mockDbForTables({
      unresolved_people: { mode: "head", count: 4 },
      unknown_trainings: { mode: "head", count: 2 },
      pending_roster_events: { mode: "head", count: 1 },
      imports: { mode: "head", count: 3 },
      new_hire_tracker_rows: { mode: "head", count: 11 },
      separation_tracker_rows: { mode: "head", count: 7 },
      hub_settings: {
        mode: "rows",
        rows: [{ value: JSON.stringify({ timestamp: "2026-04-14T10:00:00.000Z", source: "separations" }) }],
      },
    });

    const res = await getOverview(buildRequest("http://localhost/api/workflows/overview") as never, undefined);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.kpis.open_people).toBe(4);
    expect(body.kpis.open_trainings).toBe(2);
    expect(body.kpis.pending_roster_events).toBe(1);
    expect(body.kpis.new_hire_audit_rows).toBe(11);
    expect(body.kpis.separation_audit_rows).toBe(7);
    expect(body.sync.last_sync_source).toBe("separations");
  });

  it("returns 401 for protected route when HR cookie missing", async () => {
    requireHrCookieMock.mockRejectedValue(
      new ApiError("HR session required", 401, "unauthorized")
    );
    mockDbForTables({
      imports: { mode: "head", count: 0 },
    });

    const res = await getNewHires(buildRequest("http://localhost/api/workflows/new-hires") as never, undefined);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toContain("HR session required");
  });

  it("returns new hire workflow payload with recent tracker rows", async () => {
    mockDbForTables({
      new_hire_tracker_rows: {
        mode: "rows",
        count: 12,
        rows: [
          {
            id: "r1",
            sheet: "April 2026",
            row_number: 10,
            first_name: "Jane",
            last_name: "Doe",
            hire_date: "2026-04-10",
            status: "active",
            updated_at: "2026-04-14T10:00:00.000Z",
          },
        ],
      },
      unresolved_people: { mode: "head", count: 5 },
      unknown_trainings: { mode: "head", count: 3 },
      pending_roster_events: { mode: "head", count: 2 },
      employees: { mode: "head", count: 9 },
    });

    const res = await getNewHires(buildRequest("http://localhost/api/workflows/new-hires") as never, undefined);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totals.review_people_open).toBe(5);
    expect(body.totals.review_trainings_open).toBe(3);
    expect(body.totals.pending_roster_events).toBe(2);
    expect(body.recent_tracker_rows).toHaveLength(1);
  });

  it("returns separation workflow payload with sync health", async () => {
    mockDbForTables({
      separation_tracker_rows: {
        mode: "rows",
        count: 21,
        rows: [
          {
            id: "s1",
            fy_sheet: "FY 2026",
            row_number: 12,
            first_name: "Alex",
            last_name: "Smith",
            date_of_separation: "2026-04-01",
            sync_status: "synced",
            notes: null,
          },
        ],
      },
      unresolved_people: { mode: "head", count: 1 },
      unknown_trainings: { mode: "head", count: 0 },
      pending_roster_events: { mode: "head", count: 1 },
      employees: { mode: "head", count: 4 },
      hub_settings: {
        mode: "rows",
        rows: [{ value: JSON.stringify({ timestamp: new Date().toISOString(), source: "separations", total_rows: 20 }) }],
      },
    });

    const res = await getSeparations(buildRequest("http://localhost/api/workflows/separations") as never, undefined);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.kpis.audit_rows).toBe(21);
    expect(body.kpis.unresolved_people).toBe(1);
    expect(body.kpis.pending_roster_events).toBe(1);
    expect(body.sync.stale).toBe(false);
    expect(body.action_links.some((action: { href: string }) => action.href === "/roster-queue")).toBe(true);
  });
});
