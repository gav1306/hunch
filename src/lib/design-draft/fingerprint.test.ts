import { describe, expect, it } from "vitest";
import { designFingerprint, designInputFor, type DesignInput } from "./fingerprint";

const hypothesis = {
  statement: "Coffee after 2pm costs me sleep.",
  outcomeMetric: "hours of sleep",
  outcomeType: "continuous",
  confounders: ["alcohol", "stress"],
};

describe("designInputFor", () => {
  it("builds a phased input with no exposure label", () => {
    expect(designInputFor(hypothesis, { schedulable: true, exposureLabel: "had coffee" })).toEqual({
      statement: "Coffee after 2pm costs me sleep.",
      outcomeMetric: "hours of sleep",
      outcomeType: "continuous",
      confounderNames: ["alcohol", "stress"],
      shape: "phased",
      exposureLabel: undefined,
    });
  });

  it("builds an observational input carrying the trimmed exposure label", () => {
    const input = designInputFor(hypothesis, { schedulable: false, exposureLabel: "  played basketball " });
    expect(input.shape).toBe("observational");
    expect(input.exposureLabel).toBe("played basketball");
  });

  it("maps a stored outcome type onto the engine's two", () => {
    expect(designInputFor({ ...hypothesis, outcomeType: "amount" }, { schedulable: true }).outcomeType).toBe(
      "continuous",
    );
  });
});

describe("designFingerprint", () => {
  const phased = designInputFor(hypothesis, { schedulable: true });
  const observational = designInputFor(hypothesis, { schedulable: false, exposureLabel: "played basketball" });

  it("is a sha256 hex digest, equal for equal inputs", () => {
    const fp = designFingerprint(phased);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(designFingerprint({ ...phased, confounderNames: [...phased.confounderNames] })).toBe(fp);
  });

  it.each<[string, Partial<DesignInput>]>([
    ["statement", { statement: "Coffee after noon costs me sleep." }],
    ["outcomeMetric", { outcomeMetric: "sleep quality 1-5" }],
    ["outcomeType", { outcomeType: "binary" }],
    ["confounderNames", { confounderNames: ["alcohol"] }],
    ["shape", { shape: "observational" }],
  ])("changes when %s changes", (_field, change) => {
    expect(designFingerprint({ ...phased, ...change })).not.toBe(designFingerprint(phased));
  });

  it("ignores the exposure label on a phased design", () => {
    expect(designFingerprint({ ...phased, exposureLabel: "had coffee" })).toBe(designFingerprint(phased));
  });

  it("counts the exposure label on an observational design, ignoring surrounding whitespace", () => {
    expect(designFingerprint({ ...observational, exposureLabel: "went to the gym" })).not.toBe(
      designFingerprint(observational),
    );
    expect(designFingerprint({ ...observational, exposureLabel: " played basketball  " })).toBe(
      designFingerprint(observational),
    );
  });

  it("changes when effectSize changes", () => {
    expect(designFingerprint({ ...phased, effectSize: "medium" })).not.toBe(
      designFingerprint({ ...phased, effectSize: "large" }),
    );
    expect(designFingerprint({ ...phased, effectSize: "medium" })).not.toBe(designFingerprint(phased));
  });
});
