import { describe, expect, it } from "vitest";
import { estimateTrialLength } from "@/mastra/tools/power-analysis";
import { powerInfoSchema } from "@/lib/schemas/protocol";

describe("estimateTrialLength", () => {
  it("returns a schema-valid PowerInfo", () => {
    expect(powerInfoSchema.safeParse(estimateTrialLength({ outcomeType: "binary" })).success).toBe(true);
  });

  it("defaults binary outcomes to 14 days per phase at medium effect", () => {
    expect(estimateTrialLength({ outcomeType: "binary" }).minDaysPerPhase).toBe(14);
  });

  it("defaults continuous outcomes to 7 days per phase at medium effect", () => {
    expect(estimateTrialLength({ outcomeType: "continuous" }).minDaysPerPhase).toBe(7);
  });

  it("doubles the days for a small effect", () => {
    expect(estimateTrialLength({ outcomeType: "binary", effectSize: "small" }).minDaysPerPhase).toBe(28);
  });

  it("shortens the days for a large effect, with a floor of 3", () => {
    expect(estimateTrialLength({ outcomeType: "continuous", effectSize: "large" }).minDaysPerPhase).toBe(4);
    expect(estimateTrialLength({ outcomeType: "binary", effectSize: "large" }).minDaysPerPhase).toBe(7);
  });

  it("echoes the chosen effect size", () => {
    expect(estimateTrialLength({ outcomeType: "binary", effectSize: "small" }).effectSize).toBe("small");
  });
});
