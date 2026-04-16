import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeComplianceStatus, pickLatestCompletion } from "./compliance";

describe("computeComplianceStatus", () => {
  it("marks non expiring completion as current", () => {
    const ref = new Date("2026-04-15");
    const s = computeComplianceStatus({
      required: true,
      exemptionActive: false,
      latestCompletion: {
        completed_on: "2026-01-01",
        expires_on: null,
        source: "manual",
      },
      referenceDate: ref,
    });
    assert.equal(s, "CURRENT");
  });

  it("marks expired when past expires_on", () => {
    const ref = new Date("2026-04-15");
    const s = computeComplianceStatus({
      required: true,
      exemptionActive: false,
      latestCompletion: {
        completed_on: "2025-01-01",
        expires_on: "2026-03-01",
        source: "manual",
      },
      referenceDate: ref,
    });
    assert.equal(s, "EXPIRED");
  });
});

describe("pickLatestCompletion", () => {
  it("picks newest completed_on", () => {
    const best = pickLatestCompletion([
      { completed_on: "2025-01-01", expires_on: "2025-07-01", source: "manual" },
      { completed_on: "2026-02-01", expires_on: "2027-02-01", source: "manual" },
    ]);
    assert.equal(best?.completed_on, "2026-02-01");
  });
});
