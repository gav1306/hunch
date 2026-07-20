"use client";

import { BeliefMeter } from "@/components/belief-meter";
import { useVerdict } from "@/hooks/use-verdict";
import type { Belief } from "@/lib/schemas/belief";
import type { Verdict } from "@/lib/schemas/verdict";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

/** Headline copy + brand tone token per verdict category. */
const HEADLINE: Record<Verdict["category"], { title: string; tone: string }> = {
  helped: { title: "It helped ✓", tone: "var(--s1)" },
  hurt: { title: "It hurt ✗", tone: "var(--s2)" },
  inconclusive_no_effect: { title: "No detectable effect", tone: "var(--muted)" },
  inconclusive_insufficient: { title: "Not enough data", tone: "var(--muted)" },
};

/** Reconstruct a live Belief from the frozen snapshot so we can reuse the meter. */
function beliefFrom(v: Verdict): Belief {
  return {
    pEffect: v.pEffect, effect: v.effect, ci: v.ci,
    nA: v.nA, nB: v.nB, model: v.model, state: "live",
  };
}

/**
 * The concluded-trial verdict: a category headline, the Analyst's plain-English
 * verdict, and (when the data was sufficient) the frozen credible-interval meter.
 * Inconclusive outcomes are shown as legitimate findings, not errors. Brand system.
 */
export function VerdictView({ hunchId }: { hunchId: string }) {
  const query = useVerdict(hunchId);

  if (query.isPending) {
    return <p style={{ ...label, textTransform: "none", letterSpacing: "0.04em" }}>Writing your verdict…</p>;
  }
  if (query.isError) {
    return <p style={{ fontSize: 13, color: "var(--s1)" }}>{query.error.message}</p>;
  }

  const v = query.data.verdict;
  const head = HEADLINE[v.category];
  const hasStats = v.category !== "inconclusive_insufficient";

  return (
    <section
      style={{
        display: "grid",
        gap: 18,
        background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
        border: "1px solid var(--rule)",
        padding: "clamp(20px,2.4vw,28px)",
      }}
    >
      <div>
        <p style={label}>Verdict</p>
        <h2 style={{ margin: "8px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(26px,4vw,36px)", letterSpacing: "-0.02em", color: head.tone }}>
          {head.title}
        </h2>
      </div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "var(--ink)" }}>{v.narrative}</p>
      {hasStats && <BeliefMeter belief={beliefFrom(v)} />}
    </section>
  );
}
