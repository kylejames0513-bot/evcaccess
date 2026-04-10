import { describe, expect, it } from "vitest";
import {
  buildNameAliases,
  namesEqual,
  normalizeNameComponent,
  parseName,
  splitFirstName,
} from "./name-match";

// Pure tests only. resolveEmployee() lives in this same module but is async
// and hits the db, so it's covered by integration tests in step 2.5d
// once a test fixture exists.

describe("parseName", () => {
  it("parses Last, First", () => {
    expect(parseName("Smith, Jane")).toEqual({ first: "Jane", last: "Smith", preferred: null });
  });

  it("parses Last, First Middle", () => {
    expect(parseName("Smith, Jane Marie")).toEqual({
      first: "Jane",
      last: "Smith",
      preferred: null,
    });
  });

  it("extracts a quoted preferred name", () => {
    expect(parseName('Abney, Michael "Mike"')).toEqual({
      first: "Michael",
      last: "Abney",
      preferred: "Mike",
    });
  });

  it("parses First Last", () => {
    expect(parseName("Jane Smith")).toEqual({ first: "Jane", last: "Smith", preferred: null });
  });

  it("parses First Middle Last", () => {
    expect(parseName("Jane Marie Smith")).toEqual({
      first: "Jane",
      last: "Smith",
      preferred: null,
    });
  });

  it("returns null for empty/single tokens", () => {
    expect(parseName("")).toBeNull();
    expect(parseName("Smith")).toBeNull();
    expect(parseName(",")).toBeNull();
  });
});

describe("normalizeNameComponent", () => {
  it("lowercases, trims, strips diacritics, drops punctuation", () => {
    expect(normalizeNameComponent("  O'Connor ")).toBe("oconnor");
    expect(normalizeNameComponent("Müller")).toBe("muller");
    expect(normalizeNameComponent("D'Angelo-Smith")).toBe("dangelosmith");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeNameComponent("Mc  Donald")).toBe("mc donald");
  });
});

describe("splitFirstName", () => {
  it("strips quoted preferred name", () => {
    expect(splitFirstName('Michael "Mike"')).toEqual({ first: "Michael", preferred: "Mike" });
  });

  it("strips parenthesized preferred name", () => {
    expect(splitFirstName("Niyonyishu (Frank)")).toEqual({
      first: "Niyonyishu",
      preferred: "Frank",
    });
  });

  it("returns null preferred when no decoration", () => {
    expect(splitFirstName("Catherine")).toEqual({ first: "Catherine", preferred: null });
  });

  it("handles preferred matching legal name", () => {
    expect(splitFirstName('Jamie "Jamie"')).toEqual({ first: "Jamie", preferred: "Jamie" });
  });
});

describe("buildNameAliases", () => {
  it("returns Last, First and First Last by default", () => {
    const aliases = buildNameAliases({ lastName: "Smith", firstName: "Jane" });
    expect(aliases).toContain("Smith, Jane");
    expect(aliases).toContain("Jane Smith");
  });

  it("includes preferred and legal both when they differ", () => {
    const aliases = buildNameAliases({
      lastName: "Abney",
      firstName: "Michael",
      preferredName: "Mike",
    });
    expect(aliases).toContain("Abney, Michael");
    expect(aliases).toContain("Abney, Mike");
    expect(aliases).toContain("Michael Abney");
    expect(aliases).toContain("Mike Abney");
    expect(aliases).toContain('Abney, Michael "Mike"');
    expect(aliases).toContain('Michael "Mike" Abney');
  });

  it("does not duplicate when preferred matches legal name", () => {
    const aliases = buildNameAliases({
      lastName: "Smith",
      firstName: "Jane",
      preferredName: "Jane",
    });
    // Only the two base shapes
    expect(aliases.sort()).toEqual(["Jane Smith", "Smith, Jane"].sort());
  });

  it("includes middle initial variant when middle name supplied", () => {
    const aliases = buildNameAliases({
      lastName: "Smith",
      firstName: "Jane",
      middleName: "Marie",
    });
    expect(aliases).toContain("Smith, Jane M");
    expect(aliases).toContain("Jane M Smith");
  });

  it("returns empty array if last or first name is missing", () => {
    expect(buildNameAliases({ lastName: "", firstName: "Jane" })).toEqual([]);
    expect(buildNameAliases({ lastName: "Smith", firstName: "" })).toEqual([]);
  });
});

describe("namesEqual", () => {
  it("matches case-insensitive after normalization", () => {
    expect(
      namesEqual(
        { first: "Jane", last: "Smith", preferred: null },
        { first: "JANE", last: "smith", preferred: null }
      )
    ).toBe(true);
  });

  it("ignores diacritics and punctuation", () => {
    expect(
      namesEqual(
        { first: "Jose", last: "O'Brien", preferred: null },
        { first: "José", last: "OBrien", preferred: null }
      )
    ).toBe(true);
  });

  it("rejects different surnames", () => {
    expect(
      namesEqual(
        { first: "Jane", last: "Smith", preferred: null },
        { first: "Jane", last: "Jones", preferred: null }
      )
    ).toBe(false);
  });
});
