import { describe, expect, it } from "vitest";
import {
  confounderSchema,
  designResultSchema,
  powerInfoSchema,
  protocolDesignSchema,
  safetyVerdictSchema,
} from "@/lib/schemas/protocol";

describe("protocol schemas", () => {
  const confounder = {
    name: "afternoon caffeine",
    type: "behavioral" as const,
    expectedDirection: "unknown" as const,
    control: "Hold caffeine intake constant throughout the experiment.",
  };
  const design = {
    phases: [
      { label: "A" as const, kind: "baseline" as const, days: 7 },
      { label: "B" as const, kind: "intervention" as const, days: 7 },
      { label: "A" as const, kind: "baseline" as const, days: 7 },
    ],
    washoutDays: 2,
    controls: ["Hold caffeine intake constant throughout the experiment."],
    instructions: "Track your sleep every morning for all three phases.",
  };
  const powerInfo = { minDaysPerPhase: 7, rationale: "x", effectSize: "medium" as const };
  const safety = { state: "approved" as const, reason: "x", routedToDoctor: false };

  it("accepts a valid confounder", () => {
    expect(confounderSchema.safeParse(confounder).success).toBe(true);
  });

  it("accepts a valid ABA design", () => {
    expect(protocolDesignSchema.safeParse(design).success).toBe(true);
  });

  it("rejects a design with fewer than two phases", () => {
    expect(
      protocolDesignSchema.safeParse({ ...design, phases: [design.phases[0]] }).success,
    ).toBe(false);
  });

  it("rejects a non-integer minDaysPerPhase", () => {
    expect(powerInfoSchema.safeParse({ ...powerInfo, minDaysPerPhase: 7.5 }).success).toBe(false);
  });

  it("rejects an unknown safety state", () => {
    expect(safetyVerdictSchema.safeParse({ ...safety, state: "maybe" }).success).toBe(false);
  });

  it("accepts a full design result", () => {
    expect(
      designResultSchema.safeParse({ confounders: [confounder], design, powerInfo, safety }).success,
    ).toBe(true);
  });
});
