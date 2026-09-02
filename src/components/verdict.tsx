"use client";

import { BeliefMeter } from "@/components/belief-meter";
import { VerdictActions } from "@/components/hunch/verdict-actions";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useVerdict } from "@/hooks/use-verdict";
import type { Belief } from "@/lib/schemas/belief";
import type { Verdict } from "@/lib/schemas/verdict";
import { verdictHeadline } from "@/lib/verdict";

/**
 * The icon per category — direction only, and nothing at all when there is no
 * direction to show.
 *
 * This used to be a check and a cross on --good/--bad, which asserted that a
 * rising number was a win. `effect` is meanB - meanA on the raw outcome, so it
 * carries no idea whether up is good: for bugs, spending or symptoms it is the
 * opposite. An arrow says the one thing the engine actually knows.
 */
const ICON: Record<Verdict["category"], typeof ArrowUpIcon | undefined> = {
  helped: ArrowUpIcon,
  hurt: ArrowDownIcon,
  inconclusive_no_effect: undefined,
  inconclusive_insufficient: undefined,
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
export function VerdictView({
  hunchId,
  statement,
  archived = false,
}: {
  hunchId: string;
  /** The hypothesis this verdict answers — seeds the follow-up. */
  statement?: string;
  /** Whether this hunch is currently filed away. */
  archived?: boolean;
}) {
  const query = useVerdict(hunchId);

  if (query.isPending) {
    return (
      <p className="text-xs tracking-[0.04em] text-muted-foreground">Writing your verdict…</p>
    );
  }
  if (query.isError) {
    return <p className="text-sm text-s1">{query.error.message}</p>;
  }

  const v = query.data.verdict;
  const title = verdictHeadline(v.category, v.outcome ?? null);
  const Icon = ICON[v.category];
  const hasStats = v.category !== "inconclusive_insufficient";

  return (
    <section className="grid max-w-full min-w-0 gap-[18px] rounded-lg border border-rule bg-card p-[clamp(20px,2.4vw,28px)]">
      <div>
        <p className="m-0 text-xs tracking-[0.16em] text-muted-foreground uppercase">Verdict</p>
        <h2 className="mt-2 mb-0 flex items-center gap-2.5 font-heading text-[clamp(26px,4vw,36px)] font-bold tracking-[-0.02em] text-ink">
          {title}
          {Icon && <Icon aria-hidden className="size-[0.8em]" strokeWidth={2.5} />}
        </h2>
      </div>
      <p className="m-0 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
        {v.narrative}
      </p>
      {hasStats && <BeliefMeter belief={beliefFrom(v)} />}
      {statement && (
        <VerdictActions hunchId={hunchId} statement={statement} archived={archived} />
      )}
    </section>
  );
}
