import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evcFiscalYear,
  findFYSheetName,
  findMonthBlock,
  formatSheetDate,
  lengthOfService,
  monthUpper,
} from "./separationSummary.util";

describe("evcFiscalYear", () => {
  it("June 30 belongs to the calendar year's FY", () => {
    assert.equal(evcFiscalYear("2026-06-30"), 2026);
  });
  it("July 1 is the first day of next FY", () => {
    assert.equal(evcFiscalYear("2026-07-01"), 2027);
  });
  it("January is in the calendar year's FY", () => {
    assert.equal(evcFiscalYear("2026-01-01"), 2026);
  });
  it("throws on garbage input", () => {
    assert.throws(() => evcFiscalYear("not-a-date"));
    assert.throws(() => evcFiscalYear("2026-13-01"));
  });
});

describe("monthUpper", () => {
  it("returns uppercase month name", () => {
    assert.equal(monthUpper("2026-04-23"), "APRIL");
    assert.equal(monthUpper("2026-12-31"), "DECEMBER");
  });
});

describe("formatSheetDate", () => {
  it("returns M/D/YYYY", () => {
    assert.equal(formatSheetDate("2026-04-23"), "4/23/2026");
  });
  it("returns empty string on null/empty", () => {
    assert.equal(formatSheetDate(null), "");
    assert.equal(formatSheetDate(""), "");
  });
  it("returns original on unparseable", () => {
    assert.equal(formatSheetDate("garbage"), "garbage");
  });
});

describe("lengthOfService", () => {
  it("computes years + months", () => {
    assert.equal(lengthOfService("2023-04-15", "2026-04-15"), "3y 0m");
    assert.equal(lengthOfService("2023-01-01", "2026-04-15"), "3y 3m");
  });
  it("handles the day-of-month rollback", () => {
    // Oct 15, 2023 → Oct 10, 2024: not yet 1 year
    assert.equal(lengthOfService("2023-10-15", "2024-10-10"), "0y 11m");
  });
  it("returns '' when hire date missing", () => {
    assert.equal(lengthOfService(null, "2026-04-15"), "");
    assert.equal(lengthOfService("", "2026-04-15"), "");
  });
});

describe("findFYSheetName", () => {
  it("picks the right FY tab", () => {
    const names = [
      "Dashboard",
      "Multi-Year Analytics",
      "FY 2027 (Jan27-Dec27)",
      "FY 2026 (Jan26-Dec26)",
      "Data",
    ];
    assert.equal(findFYSheetName(names, 2026), "FY 2026 (Jan26-Dec26)");
    assert.equal(findFYSheetName(names, 2027), "FY 2027 (Jan27-Dec27)");
    assert.equal(findFYSheetName(names, 2030), null);
  });
});

describe("findMonthBlock", () => {
  // Fixture mimicking the FY sheet shape: month label, header, data rows.
  const rows: unknown[][] = [
    [""], ["EMPLOYEE SEPARATION SUMMARY — FY 2026"], [""], [""],
    ["Active Employees:", 364], [""],
    ["JANUARY 2026"],                                       // 6
    ["Name", "Date of Separation", "DOH"],                  // 7 (header)
    ["", "", ""],                                           // 8 (empty data)
    ["", "", ""],                                           // 9
    ["FEBRUARY 2026"],                                      // 10
    ["Name", "Date of Separation", "DOH"],                  // 11 (header)
    ["Smith, John", "2/15/2026", "1/1/2020"],               // 12
    ["", "", ""],                                           // 13
    ["MARCH 2026"],                                         // 14
    ["Name", "Date of Separation", "DOH"],                  // 15
    ["", "", ""],                                           // 16
  ];

  it("locates a month header + its range", () => {
    const jan = findMonthBlock(rows, "JANUARY");
    assert.ok(jan, "JANUARY should be found");
    assert.equal(jan!.headerIdx, 7);
    assert.equal(jan!.lastDataIdx, 9);

    const feb = findMonthBlock(rows, "FEBRUARY");
    assert.ok(feb);
    assert.equal(feb!.headerIdx, 11);
    assert.equal(feb!.lastDataIdx, 13);

    const mar = findMonthBlock(rows, "MARCH");
    assert.ok(mar);
    assert.equal(mar!.headerIdx, 15);
    // March runs to end of sheet
    assert.equal(mar!.lastDataIdx, rows.length - 1);
  });

  it("returns null when the month isn't present", () => {
    assert.equal(findMonthBlock(rows, "DECEMBER"), null);
  });
});
