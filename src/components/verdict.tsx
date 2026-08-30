"use client";

import { BeliefMeter } from "@/components/belief-meter";
import { VerdictActions } from "@/components/hunch/verdict-actions";
import { CheckIcon, XIcon } from "lucide-react";
import { useVerdict } from "@/hooks/use-verdict";
import { cn } from "@/lib/utils";
import type { Belief } from "@/lib/schemas/belief";
import type { Verdict } from "@/lib/schemas/verdict";

/**
 * Headline copy + result token per verdict category. The tone comes from the
 * semantic pair, not the brand accents: helped and hurt used to be --s1 and --s2
 * here but both --s1 on home, so the same result read two ways depending on the
 * screen. The word carries the meaning; the colour only agrees with it.
 */
const HEADLINE: Record<
  Verdict["category"],
  { title: string; tone: string; Icon?: typeof CheckIcon }
> = {
  helped: { title: "It helped", tone: "text-good", Icon: CheckIcon },
  hurt: { title: "It hurt", tone: "text-bad", Icon: XIcon },
  inconclusive_no_effect: { title: "No detectable effect", tone: "text-neutral" },
  inconclusive_insufficient: { title: "Not enough data", tone: "text-neutral" },
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
  const head = HEADLINE[v.category];
  const hasStats = v.category !== "inconclusive_insufficient";

  return (
    <section className="grid max-w-full min-w-0 gap-[18px] rounded-lg border border-rule bg-card p-[clamp(20px,2.4vw,28px)]">
      <div>
        <p className="m-0 text-xs tracking-[0.16em] text-muted-foreground uppercase">Verdict</p>
        <h2
          className={cn(
            "mt-2 mb-0 flex items-center gap-2.5 font-heading text-[clamp(26px,4vw,36px)] font-bold tracking-[-0.02em]",
            head.tone,
          )}
        >
          {head.title}
          {head.Icon && <head.Icon aria-hidden className="size-[0.8em]" strokeWidth={2.5} />}
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
