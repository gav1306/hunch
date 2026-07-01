import { describe, expect, it } from "vitest";
import { normalNormal } from "@/lib/bayes/normal-normal";

describe("normalNormal", () => {
  it("is warming-up with too few points", () => {
    const r = normalNormal.update([5, 6], [7, 8, 9]);
    expect(r.state).toBe("warming-up");
    expect(r.model).toBe("normal-normal");
  });
  it("favors B when B readings are clearly higher", () => {
    const r = normalNormal.update([5, 5, 6, 5, 6], [9, 10, 9, 10, 9]);
    expect(r.pEffect).toBeGreaterThan(0.9);
    expect(r.effect).toBeGreaterThan(0);
    expect(r.state).toBe("live");
  });
  it("favors A when A readings are clearly higher", () => {
    const r = normalNormal.update([9, 10, 9, 10, 9], [5, 5, 6, 5, 6]);
    expect(r.pEffect).toBeLessThan(0.1);
    expect(r.effect).toBeLessThan(0);
  });
  it("gives a tight CI when arms separate cleanly with no within-arm noise", () => {
    // Perfectly consistent, cleanly separated arms — the effect is near-certain,
    // so the credible interval must collapse to ~the effect itself. Grand-mean
    // variance pooling wrongly counts the between-arm gap as noise and blows the
    // CI up ~5x; within-arm pooling keeps it tight.
    const r = normalNormal.update([5, 5, 5], [10, 10, 10]);
    expect(r.effect).toBeCloseTo(5, 5);
    expect(r.pEffect).toBeGreaterThan(0.999);
    expect(r.ci[1] - r.ci[0]).toBeLessThan(0.01);
  });
  it("is near 0.5 when arms overlap heavily", () => {
    const r = normalNormal.update([5, 6, 7, 6, 5], [5, 6, 7, 6, 5]);
    expect(r.pEffect).toBeCloseTo(0.5, 2);
    expect(r.effect).toBeCloseTo(0, 5);
  });
  it("does not throw when all readings are identical", () => {
    const r = normalNormal.update([5, 5, 5], [5, 5, 5]);
    expect(Number.isFinite(r.pEffect)).toBe(true);
  });
  it("is deterministic", () => {
    const a = [5, 6, 7, 6], b = [8, 9, 8, 9];
    expect(normalNormal.update(a, b)).toEqual(normalNormal.update(a, b));
  });
});
