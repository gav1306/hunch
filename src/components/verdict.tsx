"use client";

import { BeliefMeter } from "@/components/belief-meter";
import { useVerdict } from "@/hooks/use-verdict";
import type { Belief } from "@/lib/schemas/belief";
import type { Verdict } from "@/lib/schemas/verdict";

const HEADLINE: Record<Verdict["category"], { title: string; tone: string }> = {
  helped: { title: "It helped ✓", tone: "text-foreground" },
  hurt: { title: "It hurt ✗", tone: "text-destructive" },
  inconclusive_no_effect: { title: "No detectable effect", tone: "text-muted-foreground" },
  inconclusive_insufficient: { title: "Not enough data", tone: "text-muted-foreground" },
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
 * Inconclusive outcomes are shown as legitimate findings, not errors.
 */
export function VerdictView({ hunchId }: { hunchId: string }) {
  const query = useVerdict(hunchId);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Writing your verdict…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">{query.error.message}</p>;
  }

  const v = query.data.verdict;
  const head = HEADLINE[v.category];
  const hasStats = v.category !== "inconclusive_insufficient";

  return (
    <section className="space-y-4 rounded-xl border p-6">
      <div>
        <p className="text-sm text-muted-foreground">Verdict</p>
        <h2 className={`text-3xl font-bold ${head.tone}`}>{head.title}</h2>
      </div>
      <p className="text-sm leading-6">{v.narrative}</p>
      {hasStats && <BeliefMeter belief={beliefFrom(v)} />}
    </section>
  );
}
