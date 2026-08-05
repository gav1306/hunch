import { describe, expect, it } from "vitest";
import { beliefSchema } from "@/lib/schemas/belief";

describe("beliefSchema", () => {
  it("accepts a well-formed belief", () => {
    const ok = {
      pEffect: 0.78,
      effect: 0.2,
      ci: [0.05, 0.35] as [number, number],
      nA: 7,
      nB: 7,
      model: "beta-binomial" as const,
      state: "live" as const,
    };
    expect(beliefSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects pEffect above 1", () => {
    const bad = { pEffect: 1.5, effect: 0, ci: [0, 0], nA: 1, nB: 1, model: "normal-normal", state: "warming-up" };
    expect(beliefSchema.safeParse(bad).success).toBe(false);
  });
});
