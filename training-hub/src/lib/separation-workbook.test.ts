import { describe, expect, it } from "vitest";
import { parseSeparationWorkbook, toIsoDate, splitName } from "./separation-workbook";

describe("parseSeparationWorkbook", () => {
  it("parses rows from FY sheets and skips non-FY sheets", () => {
    const workbook = {
      SheetNames: ["Dashboard", "FY 2026 (Jan26-Dec26)", "FY 2027 (Jan27-Dec27)"],
      Sheets: {
        Dashboard: {
          A9: { v: "Ignore, Me" },
          B9: { v: "2026-01-01" },
        },
        "FY 2026 (Jan26-Dec26)": {
          A9: { v: "Smith, John" },
          B9: { v: "2026-01-05" },
          A10: { v: "Doe, Jane" },
          B10: { v: 46037 }, // Excel serial
          A11: { v: "NoDate, Person" },
        },
        "FY 2027 (Jan27-Dec27)": {
          A9: { v: "SingleName" },
          B9: { v: "2027-02-10" },
          A10: { v: " " },
          B10: { v: "2027-02-11" },
        },
      },
    };

    const parsed = parseSeparationWorkbook(workbook as never);
    expect(parsed.summary.fySheets).toEqual(["FY 2026 (Jan26-Dec26)", "FY 2027 (Jan27-Dec27)"]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toEqual({
      last_name: "Smith",
      first_name: "John",
      date_of_separation: "2026-01-05",
      sheet: "FY 2026 (Jan26-Dec26)",
      row_number: 9,
    });
    expect(parsed.rows[2]).toEqual({
      last_name: "SingleName",
      first_name: null,
      date_of_separation: "2027-02-10",
      sheet: "FY 2027 (Jan27-Dec27)",
      row_number: 9,
    });
    expect(parsed.summary.totalRows).toBe(3);
    expect(parsed.summary.skippedRows).toBe(2);
  });
});

describe("splitName", () => {
  it("handles comma and first-last forms", () => {
    expect(splitName("Smith, John")).toEqual({ last_name: "Smith", first_name: "John" });
    expect(splitName("John Smith")).toEqual({ last_name: "Smith", first_name: "John" });
    expect(splitName("Solo")).toEqual({ last_name: "Solo", first_name: null });
  });
});

describe("toIsoDate", () => {
  it("normalizes supported date formats", () => {
    expect(toIsoDate("2026-04-15")).toBe("2026-04-15");
    expect(toIsoDate(new Date("2026-04-15T12:00:00Z"))).toBe("2026-04-15");
    expect(toIsoDate(46035)).toBe("2026-01-13");
    expect(toIsoDate("not a date")).toBeNull();
  });
});
