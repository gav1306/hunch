import { describe, expect, it } from "vitest";
import { computeBelief } from "@/lib/bayes";

const rows = (phase: string, values: number[]) =>
  values.map((value) => ({ phase, value }));

describe("computeBelief", () => {
  it("returns warming-up with no check-ins", () => {
    const r = computeBelief([], "binary");
    expect(r.state).toBe("warming-up");
    expect(r.nA).toBe(0);
    expect(r.nB).toBe(0);
  });
  it("routes binary outcomes to the Beta-Binomial model", () => {
    const r = computeBelief(
      [...rows("A", [0, 0, 0]), ...rows("B", [1, 1, 1])],
      "binary",
    );
    expect(r.model).toBe("beta-binomial");
    expect(r.pEffect).toBeGreaterThan(0.5);
  });
  it("routes continuous outcomes to the Normal-Normal model", () => {
    const r = computeBelief(
      [...rows("A", [5, 5, 6]), ...rows("B", [9, 9, 10])],
      "continuous",
    );
    expect(r.model).toBe("normal-normal");
    expect(r.pEffect).toBeGreaterThan(0.5);
  });
  it("splits arms by phase label", () => {
    const r = computeBelief(
      [...rows("A", [1, 0]), ...rows("B", [1, 1, 1])],
      "binary",
    );
    expect(r.nA).toBe(2);
    expect(r.nB).toBe(3);
  });
});
