"use client";

import type { ProtocolDesign } from "@/lib/schemas/protocol";
import { TrialStart } from "@/components/trial-start";
import { cn } from "@/lib/utils";

const LABEL = "text-xs tracking-[0.16em] text-muted-foreground uppercase";

/**
 * An observation window is one phase and no steps — stepping through it would
 * read "phase 1 of 1" about nothing. So it renders as a single card instead of
 * a walk-through: what to do, how long, what to log, the controls, then the
 * start block. Same card classes as `ProtocolStepper` so the two shapes read
 * as one family; `ProtocolStepper` itself is not taught a one-phase case — this
 * is the branch `ProtocolView` takes instead.
 */
export function ObservationalPlan({
  hunchId,
  hypothesis,
  design,
}: {
  hunchId: string;
  hypothesis: { statement: string; outcomeMetric: string };
  design: ProtocolDesign;
}) {
  const phase = design.phases[0];

  return (
    <section className="grid max-w-full min-w-0 gap-5">
      {/* What you're testing */}
      <div className="min-w-0 rounded-lg border border-rule border-l-2 border-l-s1 bg-card p-[clamp(16px,2vw,20px)]">
        <p className={cn(LABEL, "m-0")}>What you&apos;re testing</p>
        <h2 className="mt-2 mb-0 font-heading text-[clamp(17px,2.1vw,21px)] leading-snug font-semibold tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">
          {hypothesis.statement}
        </h2>
        <p className="mt-2.5 mb-0 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
          Measured by {hypothesis.outcomeMetric}
        </p>
      </div>

      {/* One window, one card — no timeline, because there's nothing to step through */}
      <div className="min-w-0 rounded-xl border border-rule bg-card p-[clamp(18px,2.2vw,24px)]">
        <div className="flex items-center gap-2.5">
          <span className={LABEL}>Observation window</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            {phase.days} days
          </span>
        </div>
        <h3 className="mt-3.5 mb-0 font-heading text-[clamp(19px,2.4vw,24px)] leading-tight font-semibold tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">
          {phase.name}
        </h3>
        <p className="mt-2.5 mb-0 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {phase.action}
        </p>

        <div className="mt-4 border-t border-rule pt-3.5">
          <p className={cn(LABEL, "mt-0 mb-1.5")}>What to log</p>
          <p className="m-0 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
            Each day: {hypothesis.outcomeMetric}, and the yes/no this window is
            comparing against.
          </p>
        </div>

        {design.controls.length > 0 && (
          <div className="mt-4 border-t border-rule pt-3.5">
            <p className={cn(LABEL, "mt-0 mb-1.5")}>Keep these steady</p>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {design.controls.map((c) => (
                <li key={c} className="flex min-w-0 gap-2 text-sm leading-normal text-ink">
                  <span aria-hidden className="text-s1">
                    ·
                  </span>
                  <span className="[overflow-wrap:anywhere]">{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <TrialStart hunchId={hunchId} />
    </section>
  );
}
