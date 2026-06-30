import { describe, expect, it } from "vitest";
import { normalCdf } from "@/lib/bayes/math";

describe("normalCdf", () => {
  it("is 0.5 at zero", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
  });
  it("is ~0.8413 at +1 sigma", () => {
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3);
  });
  it("is ~0.1587 at -1 sigma", () => {
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });
  it("is ~0.9772 at +2 sigma", () => {
    expect(normalCdf(2)).toBeCloseTo(0.9772, 3);
  });
  it("is deterministic", () => {
    expect(normalCdf(0.7)).toBe(normalCdf(0.7));
  });
});
