import { describe, expect, it } from "vitest";
import {
  FUZZY_STRONG_THRESHOLD,
  FUZZY_WEAK_THRESHOLD,
  classifyFuzzy,
  levenshtein,
  pickBestFuzzy,
  scoreNameAgainst,
  similarity,
} from "./fuzzy";
import type { Employee } from "@/types/database";

function emp(id: string, last: string, first: string): Employee {
  return {
    id,
    auth_id: null,
    first_name: first,
    last_name: last,
    email: null,
    role: "employee",
    job_title: null,
    department: null,
    division: null,
    program: null,
    hire_date: null,
    is_active: true,
    excusal_codes: null,
    employee_number: null,
    paylocity_id: null,
    position: null,
    aliases: [],
    reactivated_at: null,
    terminated_at: null,
    created_at: "",
    updated_at: "",
  };
}

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("returns the longer length when one is empty", () => {
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "abcd")).toBe(4);
  });

  it("counts substitutions", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("similarity", () => {
  it("normalizes diacritics and punctuation", () => {
    expect(similarity("O'Brien", "OBrien")).toBe(1);
    expect(similarity("Müller", "Muller")).toBe(1);
  });

  it("returns 1 for two empties", () => {
    expect(similarity("", "")).toBe(1);
  });

  it("scales with edit distance", () => {
    const s = similarity("Smith", "Smyth");
    expect(s).toBeGreaterThan(0.7);
    expect(s).toBeLessThan(1);
  });
});

describe("scoreNameAgainst", () => {
  it("weights last name more than first", () => {
    const exactLast = scoreNameAgainst({ last_name: "Smith", first_name: "Bob" }, "Smith", "Janet");
    const exactFirst = scoreNameAgainst({ last_name: "Jones", first_name: "Janet" }, "Smith", "Janet");
    expect(exactLast.score).toBeGreaterThan(exactFirst.score);
  });
});

describe("pickBestFuzzy", () => {
  const candidates = [
    emp("1", "Smith", "Jane"),
    emp("2", "Smyth", "Jayne"),
    emp("3", "Jones", "Robert"),
  ];

  it("returns the closest candidate when one beats threshold", () => {
    const r = pickBestFuzzy(candidates, "Smith", "Jane");
    expect(r?.employee.id).toBe("1");
    expect(r?.score).toBeGreaterThanOrEqual(FUZZY_STRONG_THRESHOLD);
  });

  it("returns weak match when nothing exact but a candidate is close", () => {
    const r = pickBestFuzzy(candidates, "Smyth", "Jane");
    expect(r).not.toBeNull();
    expect(r?.score).toBeGreaterThanOrEqual(FUZZY_WEAK_THRESHOLD);
  });

  it("returns null when nothing meets even the weak threshold", () => {
    const r = pickBestFuzzy(candidates, "Anderson", "Tabitha");
    expect(r).toBeNull();
  });
});

describe("classifyFuzzy", () => {
  it("strong above 0.92", () => {
    expect(
      classifyFuzzy({ employee: emp("1", "Smith", "Jane"), score: 0.93, lastSim: 1, firstSim: 1 })
    ).toBe("strong");
  });
  it("weak between 0.82 and 0.92", () => {
    expect(
      classifyFuzzy({ employee: emp("1", "Smith", "Jane"), score: 0.85, lastSim: 1, firstSim: 1 })
    ).toBe("weak");
  });
  it("none below 0.82", () => {
    expect(
      classifyFuzzy({ employee: emp("1", "Smith", "Jane"), score: 0.7, lastSim: 1, firstSim: 1 })
    ).toBe("none");
  });
  it("none for null", () => {
    expect(classifyFuzzy(null)).toBe("none");
  });
});
