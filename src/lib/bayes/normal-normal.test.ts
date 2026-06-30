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
