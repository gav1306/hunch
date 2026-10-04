"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import { AdherenceStrip } from "@/components/adherence-strip";
import { BeliefMeter } from "@/components/belief-meter";
import { CheckIn } from "@/components/check-in";
import { TrackerEditor } from "@/components/hunch/tracker-editor";
import { AbandonHunch } from "@/components/hunch/abandon-hunch";
import { VerdictView } from "@/components/verdict";
import { Button } from "@/components/ui/button";
import { useBelief } from "@/hooks/use-belief";
import { useHunchInfo } from "@/hooks/use-hunch-info";
import { totalDays } from "@/lib/adherence";
import { browserToday } from "@/lib/browser-day";
import { planSummary } from "@/lib/plan-summary";
import { utcDaysBetween } from "@/lib/schedule";
import { exposureSummary, runningCaveat } from "@/lib/verdict";
import { cn } from "@/lib/utils";

const CARD = "rounded-lg border border-rule bg-card p-[clamp(20px,2.4vw,28px)]";
const LABEL = "m-0 text-xs tracking-[0.16em] text-muted-foreground uppercase";

/** Blue while living as normal, red while running the change, as on home. */
const PHASE_COLOR = { baseline: "var(--s2)", intervention: "var(--s1)" } as const;

/**
 * Phase 4 dashboard: the live belief meter plus today's one-tap check-in. The
 * meter narrows as check-ins accumulate (compute-on-read, refreshed on each tap).
 * The frame comes from the slim AppShell in `/hunch/layout.tsx`; `data-wide`
 * opens its column to 1200px. While the trial runs, the evidence (meter, days,
 * trackers) takes the wide column and today's log the narrow one beside it, so
 * logging no longer sits below a screen of charts.
 */
export function HunchDashboard({
  id,
  statement,
  archived,
}: {
  id: string;
  /** The sharpened hypothesis, read on the server. Absent until sharpening. */
  statement?: string;
  /** Whether this hunch is filed away, read on the server. */
  archived: boolean;
}) {
  const query = useBelief(id);
  const info = useHunchInfo(id);
  // On the grace day the verdict waits until the user asks for it: computing
  // it freezes the trial, and with it the last day they could still fill in.
  const [verdictNow, setVerdictNow] = useState(false);

  const content = () => {
    if (query.isPending) {
      return <p className="text-xs tracking-[0.04em] text-muted-foreground">Loading…</p>;
    }
    if (query.isError) {
      return <p className="text-sm text-s1">{query.error.message}</p>;
    }

    const { belief, schedule, parameters, startsOn } = query.data;
    const concluded = schedule?.done ?? false;

    // Today's instruction. An ABA design repeats the "A" label, so the phase is
    // addressed by its index in the design — matching on the label alone would
    // show the first baseline's action during the return baseline.
    const phaseAction =
      schedule?.phaseIndex === null || schedule?.phaseIndex === undefined
        ? undefined
        : info.data?.protocol?.design.phases[schedule.phaseIndex]?.action;

    // A diary has one arm: no contrast, so no meter and no verdict. Rendering
    // either would promise a comparison the data cannot make.
    const isDiary = info.data?.protocol?.safetyState === "observe-only";

    // Null until a day has been counted, so a phased trial's first baseline
    // doesn't show "on 0 of 0".
    const exposure = query.data.exposure ?? null;
    const exposureLine = exposure ? exposureSummary(exposure) : null;
    const caveat = runningCaveat(exposure, schedule?.started === true);

    if (isDiary && concluded) {
      return (
        <section className={cn(CARD, "mx-auto max-w-160")}>
          <p className="m-0 text-sm leading-relaxed text-ink">
            Your log is complete. Nothing was changed and nothing was compared — it&rsquo;s
            the record of what happened, and it&rsquo;s yours to export.
          </p>
        </section>
      );
    }

    const grace = concluded && query.data.inGrace && !verdictNow;

    const design = info.data?.protocol?.design;
    const plan = design ? planSummary(schedule, design) : null;

    const side = (
      <>
        {grace ? (
          <section className={CARD}>
            <p className={LABEL}>Trial complete</p>
            <p className="mt-3 mb-0 text-sm leading-relaxed text-ink">
              Missed a day? Tap it in the strip and fill it in &mdash; you can until midnight.
              Your verdict will be ready tomorrow.
            </p>
            <Button
              variant="brand"
              size="touch"
              className="mt-5 border-rule"
              onClick={() => setVerdictNow(true)}
            >
              See the verdict now
            </Button>
            <p className="mt-2 mb-0 text-xs text-muted-foreground">
              Seeing it now locks in what you&rsquo;ve logged.
            </p>
          </section>
        ) : (
          <CheckIn
            hunchId={id}
            schedule={schedule}
            parameters={parameters}
            phaseAction={phaseAction}
            startsOn={startsOn}
            hasPlan={info.data?.protocol != null}
            firstPhaseAction={info.data?.protocol?.design.phases[0]?.action}
            design={info.data?.protocol?.design}
          />
        )}
        {plan && (
          <section className={CARD}>
            <p className={cn(LABEL, "mb-2")}>The plan</p>
            <dl className="m-0 text-sm">
              <PlanRow label="Now" value={plan.phase} />
              <PlanRow
                label="Phase ends"
                value={plan.endsInDays === 0 ? "today" : `in ${plan.endsInDays} day${plan.endsInDays === 1 ? "" : "s"}`}
              />
            </dl>
            {/* Controls are written as whole sentences by the Designer, so
                they read as a list, not a value squeezed into a row. */}
            {plan.controls.length > 0 && (
              <>
                <p className="mt-3 mb-2 border-t border-rule pt-3 text-xs text-muted-foreground">
                  Hold steady
                </p>
                <ul className="m-0 grid list-none gap-2 p-0 text-sm leading-relaxed text-ink">
                  {plan.controls.map((c) => (
                    <li key={c} className="flex gap-2">
                      <span aria-hidden className="text-muted-foreground">
                        –
                      </span>
                      {c}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </>
    );

    return concluded && !grace ? (
      <div className="mx-auto max-w-160">
        <VerdictView hunchId={id} statement={statement} archived={archived} />
      </div>
    ) : (
      <div className="flex flex-wrap items-start gap-6">
      <div className="grid min-w-0 flex-[999_1_560px] gap-5">
        {isDiary ? (
          <p className="m-0 text-sm text-muted-foreground">
            A log, not a trial. Nothing to change — just the record.
          </p>
        ) : (
          <>
            <BeliefMeter belief={belief} observational={exposure?.observational === true} />
            {/* An observational trial can starve quietly — a verdict that
                says "not enough days" at the end is too late to act on. A
                phased trial that also carries an exposure gets the same
                line, computed over its phase-B days. */}
            {schedule?.started && exposureLine && (
              <p className="m-0 text-sm text-muted-foreground">{exposureLine}</p>
            )}
            {/* Same caveat the verdict card carries — the running meter must
                not read as cause and effect for days the user chose. */}
            {caveat && (
              <p className="m-0 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                {caveat}
              </p>
            )}
          </>
        )}
        {/* The days behind the meter. Without it, a five-day gap and a perfect
            week look identical on every screen the app has. */}
        {schedule?.started && startsOn && info.data?.protocol && (
          <AdherenceStrip
            hunchId={id}
            startedAt={new Date(startsOn)}
            design={info.data.protocol.design}
            checkIns={query.data.checkIns}
            parameters={parameters}
          />
        )}
        {/* Only while it's running. A concluded trial's set is history — the
            verdict was computed from it, so editing it would misdescribe what
            was actually measured. */}
        {schedule?.started && !schedule.done && (
          <TrackerEditor
            hunchId={id}
            parameters={parameters}
            observational={info.data?.protocol?.design.shape === "observational"}
          />
        )}
      </div>
      <aside className="grid w-full flex-[1_1_340px] gap-5 md:max-w-[400px]">
        {side}
        <AbandonHunch hunchId={id} loggedDays={query.data.checkIns.length} />
      </aside>
      </div>
    );
  };

  // Where the trial stands, for the line above the title: the phase in its
  // colour and the day count, the same reading home's card gives.
  const schedule = query.data?.schedule;
  const design = info.data?.protocol?.design;
  const startsOn = query.data?.startsOn;
  const dayCount =
    schedule?.started && !schedule.done && design && startsOn
      ? {
          day: Math.min(
            totalDays(design),
            utcDaysBetween(new Date(startsOn), browserToday()) + 1,
          ),
          total: totalDays(design),
        }
      : null;
  const concluded = schedule?.done ?? false;
  // The grace day still shows the two columns, abandon included; only a
  // finished view (verdict or completed log) moves it to the foot.
  const finished = concluded && !(query.data?.inGrace && !verdictNow);

  return (
    <div data-wide>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="grid min-w-0 flex-[999_1_520px] gap-3">
          {schedule?.kind && !concluded && (
            <p
              className={cn(LABEL, "flex flex-wrap items-center gap-x-3")}
              style={{ "--ph": PHASE_COLOR[schedule.kind] } as React.CSSProperties}
            >
              <span className="inline-flex items-center gap-[7px] text-[color-mix(in_srgb,var(--ph)_80%,var(--ink))]">
                <span aria-hidden className="size-1.5 rounded-full bg-(--ph)" />
                {schedule.kind}
              </span>
              {dayCount && (
                <span>
                  day {dayCount.day} of {dayCount.total}
                </span>
              )}
            </p>
          )}
          <h1 className="m-0 font-heading text-[clamp(28px,3.4vw,40px)] leading-[1.1] font-bold tracking-[-0.02em] text-balance text-ink">
            {statement ?? "Your experiment"}
          </h1>
        </div>

        {/* The plan is the thing this screen is measuring against, and there was
            no way back to it: the protocol page was reachable from home's setup
            cards and nowhere else once the trial was running. */}
        {info.data?.protocol && (
          <Button
            variant="brand"
            size="touch"
            className="border-rule"
            render={<Link href={`/hunch/${id}/protocol`} />}
          >
            <ClipboardListIcon data-icon="inline-start" aria-hidden />
            See the plan
          </Button>
        )}
      </div>

      <div
        className={cn(
          "mt-[26px] transition-opacity duration-300",
          query.isPending && "opacity-50",
        )}
      >
        {content()}
      </div>

      {/* A finished trial has no side column, so abandoning stays at the foot. */}
      {(finished || !query.data) && (
        <div className="mx-auto mt-12 max-w-160 border-t border-rule pt-2">
          <AbandonHunch hunchId={id} loggedDays={query.data?.checkIns.length ?? 0} />
        </div>
      )}
    </div>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-rule py-2.5 first:border-t-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 text-right text-ink">{value}</dd>
    </div>
  );
}
