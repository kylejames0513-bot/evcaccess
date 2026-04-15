import { describe, expect, it } from "vitest";
import {
  resolveSeparationMatch,
  type SeparationRosterEmployee,
} from "./process-separations-sync";

function emp(
  id: string,
  first: string,
  last: string,
  isActive: boolean,
  aliases: string[] = []
): SeparationRosterEmployee {
  return {
    id,
    first_name: first,
    last_name: last,
    aliases,
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

  it("matches an exact preferred-name alias", () => {
    const roster = [
      emp("active-1", "Jonathan", "Smith", true, [
        "Smith, Jonathan",
        "Jonathan Smith",
        "Smith, John",
        "John Smith",
      ]),
    ];

    const match = resolveSeparationMatch(roster, "Smith", "John");

    expect(match.kind).toBe("single");
    if (match.kind !== "single") return;
    expect(match.matchType).toBe("exact");
    expect(match.employee.id).toBe("active-1");
  });

  it("does not allow partial first-name matches", () => {
    const roster = [
      emp("active-1", "Jonathan", "Smith", true, ["Smith, Jonathan", "Jonathan Smith"]),
    ];

    const match = resolveSeparationMatch(roster, "Smith", "Jon");

    expect(match.kind).toBe("none");
  });

  it("returns no match when first name is missing", () => {
    const roster = [emp("active-1", "Jane", "Doe", true, ["Doe, Jane", "Jane Doe"])];

    const match = resolveSeparationMatch(roster, "Doe", "");

    expect(match.kind).toBe("none");
  });

  it("returns no match when no exact name or alias match exists", () => {
    const roster = [emp("active-1", "Jane", "Doe", true, ["Doe, Jane", "Jane Doe"])];

    const match = resolveSeparationMatch(roster, "Smith", "John");

    expect(match.kind).toBe("none");
  });
});
