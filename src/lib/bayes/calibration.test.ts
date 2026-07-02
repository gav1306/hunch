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

/**
 * Engine calibration gate (deterministic, normal suite, no LLM / no API key).
 *
 * This is NOT a full reliability-diagram test — it does not prove that a stated
 * 70% is right exactly 70% of the time. It is a regression gate on the three
 * properties a calibrated `pEffect` must have, each of which a realistic engine
 * bug (sign flip, variance/SE scale error, systematic bias, or a degenerate
 * overconfident predictor) would break:
 *   1. discrimination — near-certain and directionally right on strong effects;
 *   2. unbiasedness   — mean ≈ 0.5 on true-null trials;
 *   3. graded confidence — genuinely intermediate probabilities on moderate
 *      effects whose mean tracks the empirical hit-rate (a 0/1 predictor fails).
 * All randomness is a local seeded PRNG; the production engine stays RNG-free.
 */
describe("engine calibration", () => {
  it("is confident and correct on trials with a real effect (low Brier)", () => {
    const rng = mulberry32(42);
    // Strong effects in both directions; outcome = (true shift > 0).
    const shifts = [2, -2, 2.5, -2.5, 3, -3, 2, -2, 2.5, -2.5];
    let brier = 0;
    let correct = 0;
    for (let i = 0; i < shifts.length; i++) {
      const shift = shifts[i] + gauss(rng) * 0.1;
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

  it("emits graded, non-degenerate confidence on moderate effects", () => {
    const rng = mulberry32(99);
    const ps: number[] = [];
    let correct = 0;
    for (let i = 0; i < 40; i++) {
      // Moderate positive effect (jittered) — neither null nor overwhelming.
      const shift = 0.8 + gauss(rng) * 0.1;
      const { pEffect } = continuousTrial(rng, shift);
      ps.push(pEffect);
      if (pEffect > 0.5) correct++;
    }
    const meanP = ps.reduce((s, p) => s + p, 0) / ps.length;
    const hitRate = correct / ps.length;
    // A degenerate overconfident engine (pEffect = effect > 0 ? 1 : 0) would emit
    // only 0/1 and fail this: a calibrated posterior spreads across the middle.
    const intermediate = ps.filter((p) => p > 0.55 && p < 0.98).length;
    expect(intermediate).toBeGreaterThan(10);
    // Mean predicted confidence should track how often it was actually right.
    expect(Math.abs(meanP - hitRate)).toBeLessThan(0.15);
  });
});
