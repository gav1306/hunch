import { describe, expect, it } from "vitest";
import { computeBelief } from "@/lib/bayes";

/** Deterministic PRNG (mulberry32) — test-only; the engine itself uses no RNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller, driven by the seeded PRNG. */
function gauss(rng: () => number): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const N_PER_ARM = 6;

/** One continuous trial: baseline ~ N(0,1), intervention ~ N(shift,1). */
function continuousTrial(rng: () => number, shift: number) {
  const a = Array.from({ length: N_PER_ARM }, () => gauss(rng));
  const b = Array.from({ length: N_PER_ARM }, () => shift + gauss(rng));
  return computeBelief(
    [
      ...a.map((value) => ({ phase: "A", value })),
      ...b.map((value) => ({ phase: "B", value })),
    ],
    "continuous",
  );
}

describe("engine calibration", () => {
  it("is confident and correct on trials with a real effect (low Brier)", () => {
    const rng = mulberry32(42);
    // Strong effects in both directions; outcome = (true shift > 0).
    const shifts = [2, -2, 2.5, -2.5, 3, -3, 2, -2, 2.5, -2.5];
    let brier = 0;
    let correct = 0;
    for (let i = 0; i < shifts.length; i++) {
      const shift = shifts[i % shifts.length] + gauss(rng) * 0.1;
      const { pEffect } = continuousTrial(rng, shift);
      const outcome = shift > 0 ? 1 : 0;
      brier += (pEffect - outcome) ** 2;
      if ((pEffect > 0.5 ? 1 : 0) === outcome) correct++;
    }
    brier /= shifts.length;
    expect(brier).toBeLessThan(0.1);
    expect(correct).toBe(shifts.length); // direction always right on strong effects
  });

  it("is appropriately uncertain on null trials (pEffect near 0.5)", () => {
    const rng = mulberry32(7);
    const ps: number[] = [];
    for (let i = 0; i < 20; i++) ps.push(continuousTrial(rng, 0).pEffect);
    const mean = ps.reduce((s, p) => s + p, 0) / ps.length;
    // No true effect -> the engine should not be confident either way.
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.65);
  });
});
