import { describe, expect, it } from "vitest";
import { paylocityRawName, phsRawName } from "./training-match";

// Pure preprocessor tests only. matchTraining() itself hits the db
// (alias dictionary lookups) and is covered by integration tests.

describe("paylocityRawName", () => {
  it("prefers Code over Skill when both present", () => {
    expect(paylocityRawName("CPR.FA", "CPR")).toBe("CPR");
  });

  it("falls back to Skill when Code is empty", () => {
    expect(paylocityRawName("Med Training", "")).toBe("Med Training");
    expect(paylocityRawName("Med Training", null)).toBe("Med Training");
    expect(paylocityRawName("Med Training", undefined)).toBe("Med Training");
  });

  it("trims whitespace", () => {
    expect(paylocityRawName(" CPR.FA ", " CPR ")).toBe("CPR");
  });
});

describe("phsRawName", () => {
  it("flags Med Admin No Show as special_status no_show", () => {
    expect(phsRawName("Med Admin", "No Show")).toEqual({ specialStatus: "no_show" });
  });

  it("flags Med Admin Fail as special_status fail", () => {
    expect(phsRawName("Med Admin", "Fail")).toEqual({ specialStatus: "fail" });
  });

  it("maps Med Admin Certification to Med Recert", () => {
    expect(phsRawName("Med Admin", "Certification")).toEqual({ name: "Med Recert" });
  });

  it("collapses every CPR/FA variant to CPR/FA", () => {
    expect(phsRawName("CPR/FA", "CPR Card")).toEqual({ name: "CPR/FA" });
    expect(phsRawName("CPR/FA", "Certification")).toEqual({ name: "CPR/FA" });
    expect(phsRawName("CPR/FA", "License")).toEqual({ name: "CPR/FA" });
  });

  it("uses Type when Category is Additional Training", () => {
    expect(phsRawName("Additional Training", "Behavior Training")).toEqual({
      name: "Behavior Training",
    });
    expect(phsRawName("Additional Training", "Safety Care")).toEqual({
      name: "Safety Care",
    });
  });

  it("returns null for fully empty input", () => {
    expect(phsRawName("", "")).toBeNull();
    expect(phsRawName(null, undefined)).toBeNull();
  });

  it("falls back to combined name when no special handling applies", () => {
    expect(phsRawName("Some New Category", "Specific Type")).toEqual({ name: "Specific Type" });
  });
});
