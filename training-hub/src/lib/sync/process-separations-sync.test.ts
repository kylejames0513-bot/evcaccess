import { describe, expect, it } from "vitest";
import {
  resolveSeparationMatch,
  type SeparationRosterEmployee,
} from "./process-separations-sync";

function emp(
  id: string,
  first: string,
  last: string,
  isActive: boolean
): SeparationRosterEmployee {
  return {
    id,
    first_name: first,
    last_name: last,
    is_active: isActive,
    terminated_at: isActive ? null : "2026-01-01T00:00:00.000Z",
  };
}

describe("resolveSeparationMatch", () => {
  it("prefers a unique active exact match over inactive duplicates", () => {
    const roster = [
      emp("inactive-1", "John", "Smith", false),
      emp("active-1", "John", "Smith", true),
    ];

    const match = resolveSeparationMatch(roster, "Smith", "John");

    expect(match.kind).toBe("single");
    if (match.kind !== "single") return;
    expect(match.matchType).toBe("exact");
    expect(match.employee.id).toBe("active-1");
    expect(match.employee.is_active).toBe(true);
  });

  it("matches a unique inactive profile when no active profile exists", () => {
    const roster = [emp("inactive-1", "John", "Smith", false)];

    const match = resolveSeparationMatch(roster, "Smith", "John");

    expect(match.kind).toBe("single");
    if (match.kind !== "single") return;
    expect(match.matchType).toBe("exact");
    expect(match.employee.id).toBe("inactive-1");
    expect(match.employee.is_active).toBe(false);
  });

  it("returns ambiguous for multiple exact matches without a unique active profile", () => {
    const roster = [
      emp("inactive-1", "John", "Smith", false),
      emp("inactive-2", "John", "Smith", false),
    ];

    const match = resolveSeparationMatch(roster, "Smith", "John");

    expect(match.kind).toBe("ambiguous");
    if (match.kind !== "ambiguous") return;
    expect(match.matchType).toBe("exact");
    expect(match.candidates).toHaveLength(2);
  });

  it("uses partial first-name matching when exact is absent", () => {
    const roster = [emp("active-1", "Johnny", "Smith", true)];

    const match = resolveSeparationMatch(roster, "Smith", "Jo");

    expect(match.kind).toBe("single");
    if (match.kind !== "single") return;
    expect(match.matchType).toBe("partial");
    expect(match.employee.id).toBe("active-1");
  });

  it("returns no match when no last-name match exists", () => {
    const roster = [emp("active-1", "Jane", "Doe", true)];

    const match = resolveSeparationMatch(roster, "Smith", "John");

    expect(match.kind).toBe("none");
  });
});
