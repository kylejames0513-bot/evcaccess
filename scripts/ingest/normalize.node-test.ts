import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeName, extractNameVariants } from "./normalize";

describe("normalizeName", () => {
  it("strips apostrophes so O'Brien == OBrien", () => {
    assert.equal(normalizeName("O'Brien"), normalizeName("OBrien"));
    assert.equal(normalizeName("O\u2019Brien"), normalizeName("obrien"));
  });

  it("strips hyphens in compound last names", () => {
    assert.equal(normalizeName("Smith-Jones"), normalizeName("SmithJones"));
    assert.equal(normalizeName("Smith-Jones"), "smithjones");
  });

  it("collapses whitespace and drops periods", () => {
    assert.equal(normalizeName("  Mary   Jane  "), "mary jane");
    assert.equal(normalizeName("A. J."), "a j");
  });

  it("is idempotent", () => {
    const once = normalizeName("Mary-Jane O'Connor");
    const twice = normalizeName(once);
    assert.equal(once, twice);
  });

  it("returns empty for empty / nullish", () => {
    assert.equal(normalizeName(""), "");
    assert.equal(normalizeName(null as unknown as string), "");
    assert.equal(normalizeName(undefined as unknown as string), "");
  });
});

describe("extractNameVariants", () => {
  it("returns the bare first name unchanged when there are no variants", () => {
    assert.deepEqual(extractNameVariants("Michael"), { primary: "Michael", variants: [] });
    assert.deepEqual(extractNameVariants("Mary Jane"), { primary: "Mary Jane", variants: [] });
  });

  it("pulls a quoted nickname out and keeps the legal name as primary", () => {
    assert.deepEqual(
      extractNameVariants('Michael "Mike"'),
      { primary: "Michael", variants: ["Mike"] },
    );
  });

  it("pulls a parenthesized nickname out", () => {
    assert.deepEqual(
      extractNameVariants("Michael (Mickey)"),
      { primary: "Michael", variants: ["Mickey"] },
    );
  });

  it("handles both quoted and parenthesized forms in the same cell", () => {
    const out = extractNameVariants('Michael "Mike" (Mickey)');
    assert.equal(out.primary, "Michael");
    assert.deepEqual(out.variants.sort(), ["Mickey", "Mike"]);
  });

  it("handles curly quotes", () => {
    assert.deepEqual(
      extractNameVariants("Michael \u201CMike\u201D"),
      { primary: "Michael", variants: ["Mike"] },
    );
  });

  it("is safe on empty input", () => {
    assert.deepEqual(extractNameVariants(""), { primary: "", variants: [] });
    assert.deepEqual(extractNameVariants(null), { primary: "", variants: [] });
  });
});
