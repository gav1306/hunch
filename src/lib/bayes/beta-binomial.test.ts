import { describe, expect, it } from "vitest";
import { betaBinomial } from "@/lib/bayes/beta-binomial";

describe("betaBinomial", () => {
  it("is near 0.5 with no evidence", () => {
    const r = betaBinomial.update([], []);
    expect(r.pEffect).toBeCloseTo(0.5, 5);
    expect(r.state).toBe("warming-up");
    expect(r.model).toBe("beta-binomial");
  });
  it("is warming-up when an arm has fewer than 3 points", () => {
    expect(betaBinomial.update([1, 1], [0, 0, 0]).state).toBe("warming-up");
  });
  it("strongly favors B when B succeeds and A fails", () => {
    const r = betaBinomial.update([0, 0, 0, 0, 1], [1, 1, 1, 1, 0]);
    expect(r.pEffect).toBeGreaterThan(0.9);
    expect(r.effect).toBeGreaterThan(0);
    expect(r.state).toBe("live");
  });
  it("strongly favors A (pEffect low) when A succeeds and B fails", () => {
    const r = betaBinomial.update([1, 1, 1, 1, 0], [0, 0, 0, 0, 1]);
    expect(r.pEffect).toBeLessThan(0.1);
    expect(r.effect).toBeLessThan(0);
  });
  it("reports arm counts", () => {
    const r = betaBinomial.update([1, 0, 1], [0, 1, 0, 1]);
    expect(r.nA).toBe(3);
    expect(r.nB).toBe(4);
  });
  it("is deterministic", () => {
    const a = [1, 0, 1, 1], b = [0, 1, 0, 0];
    expect(betaBinomial.update(a, b)).toEqual(betaBinomial.update(a, b));
  });
});
