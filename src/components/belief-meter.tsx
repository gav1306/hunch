"use client";

import type { Belief } from "@/lib/schemas/belief";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

/**
 * The live belief meter. Headline = P(effect > 0) as a percent; below it a
 * zero-centered SVG bar shows the 95% credible interval on the effect. A bar
 * straddling the center line reads as uncertain; one fully to a side reads as
 * confident. Hand-rolled SVG — no charting dependency. Brand system.
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
    <section
      style={{
        background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
        border: "1px solid var(--rule)",
        padding: "clamp(20px,2.4vw,28px)",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <p style={label}>Likelihood it&apos;s real</p>
      <p style={{ margin: "8px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(44px,7vw,60px)", lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>
        {warming ? "—" : `${pct}%`}
      </p>

      {warming ? (
        <p style={{ margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--muted)" }}>
          Gathering data — keep logging to sharpen this.
        </p>
      ) : (
        <div style={{ marginTop: 18 }}>
          <svg viewBox="0 0 100 16" style={{ height: 16, width: "100%" }} preserveAspectRatio="none">
            <line x1="50" y1="0" x2="50" y2="16" stroke="var(--rule)" strokeWidth="0.5" />
            <rect
              x={Math.min(left, right)}
              y="5"
              width={Math.max(Math.abs(right - left), 1)}
              height="6"
              rx="2"
              fill="var(--s1)"
            />
          </svg>
          <p style={{ margin: "12px 0 0", fontFamily: "'Space Mono',monospace", fontSize: 11.5, letterSpacing: "0.02em", color: "var(--muted)", overflowWrap: "anywhere" }}>
            Effect {belief.effect.toFixed(2)} · 95% CI [{belief.ci[0].toFixed(2)},{" "}
            {belief.ci[1].toFixed(2)}] · {belief.nA + belief.nB} check-ins
          </p>
        </div>
      )}
    </section>
  );
}
