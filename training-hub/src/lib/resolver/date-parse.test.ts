import { describe, expect, it } from "vitest";
import { addYears, parseDate } from "./date-parse";

describe("parseDate", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate("   ")).toBeNull();
  });

  it("parses ISO YYYY-MM-DD strings", () => {
    expect(parseDate("2025-09-04")).toBe("2025-09-04");
  });

  it("parses ISO datetimes by truncating the time part", () => {
    expect(parseDate("2025-09-04T13:45:00Z")).toBe("2025-09-04");
    expect(parseDate("2025-09-04 00:00:00")).toBe("2025-09-04");
  });

  it("parses US m/d/yyyy", () => {
    expect(parseDate("9/4/2025")).toBe("2025-09-04");
    expect(parseDate("12/31/2024")).toBe("2024-12-31");
    expect(parseDate("01/01/2026")).toBe("2026-01-01");
  });

  it("parses two-digit years with the 70 cutoff", () => {
    expect(parseDate("9/4/85")).toBe("1985-09-04");
    expect(parseDate("9/4/24")).toBe("2024-09-04");
    expect(parseDate("9/4/70")).toBe("1970-09-04");
    expect(parseDate("9/4/69")).toBe("2069-09-04");
  });

  it("parses Excel serial dates", () => {
    // 45901 = 2025-09-04 in Excel's 1900 system
    expect(parseDate(45904)).toBe("2025-09-04");
  });

  it("parses Date instances using UTC", () => {
    const d = new Date(Date.UTC(2025, 8, 4));
    expect(parseDate(d)).toBe("2025-09-04");
  });

  it("returns null for clearly bad input", () => {
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate(-5)).toBeNull();
  });
});

describe("addYears", () => {
  it("adds years preserving month/day", () => {
    expect(addYears("2025-09-04", 2)).toBe("2027-09-04");
    expect(addYears("2024-02-29", 1)).toBe("2025-02-29");
  });

  it("returns null for malformed input", () => {
    expect(addYears("garbage", 1)).toBeNull();
  });
});
