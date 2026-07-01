"use client";

import type { Belief } from "@/lib/schemas/belief";

/**
 * The live belief meter. Headline = P(effect > 0) as a percent; below it a
 * zero-centered SVG bar shows the 95% credible interval on the effect. A bar
 * straddling the center line reads as uncertain; one fully to a side reads as
 * confident. Hand-rolled SVG — no charting dependency.
 */
export function BeliefMeter({ belief }: { belief: Belief }) {
  const pct = Math.round(belief.pEffect * 100);
  const warming = belief.state === "warming-up";

  // Map the CI onto a symmetric axis sized to contain it, centered at 0.
  const span = Math.max(Math.abs(belief.ci[0]), Math.abs(belief.ci[1]), 1e-6);
  const toX = (v: number) => 50 + (v / (span * 1.1)) * 50; // 0..100 viewBox units
  const left = toX(belief.ci[0]);
  const right = toX(belief.ci[1]);

  return (
    <section className="rounded-xl border p-6">
      <p className="text-sm text-muted-foreground">Likelihood it&apos;s real</p>
      <p className="mt-1 text-5xl font-bold tabular-nums">
        {warming ? "—" : `${pct}%`}
      </p>

      {warming ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Gathering data — keep logging to sharpen this.
        </p>
      ) : (
        <div className="mt-4">
          <svg viewBox="0 0 100 16" className="h-4 w-full" preserveAspectRatio="none">
            <line x1="50" y1="0" x2="50" y2="16" stroke="currentColor" strokeWidth="0.5" className="text-border" />
            <rect
              x={Math.min(left, right)}
              y="5"
              width={Math.max(Math.abs(right - left), 1)}
              height="6"
              rx="2"
              className="fill-primary/70"
            />
          </svg>
          <p className="mt-2 text-xs text-muted-foreground">
            Effect {belief.effect.toFixed(2)} · 95% CI [{belief.ci[0].toFixed(2)},{" "}
            {belief.ci[1].toFixed(2)}] · {belief.nA + belief.nB} check-ins
          </p>
        </div>
      )}
    </section>
  );
}
