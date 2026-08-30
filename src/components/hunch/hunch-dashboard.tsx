"use client";

import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import { AdherenceStrip } from "@/components/adherence-strip";
import { BeliefMeter } from "@/components/belief-meter";
import { CheckIn } from "@/components/check-in";
import { AbandonHunch } from "@/components/hunch/abandon-hunch";
import { VerdictView } from "@/components/verdict";
import { Button } from "@/components/ui/button";
import { useBelief } from "@/hooks/use-belief";
import { useHunchInfo } from "@/hooks/use-hunch-info";
import { cn } from "@/lib/utils";

/**
 * Phase 4 dashboard: the live belief meter plus today's one-tap check-in. The
 * meter narrows as check-ins accumulate (compute-on-read, refreshed on each tap).
 * The frame — ground, header, column — comes from the slim AppShell in
 * `/hunch/layout.tsx`.
 */
export function HunchDashboard({ id }: { id: string }) {
  const query = useBelief(id);
  const info = useHunchInfo(id);

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

    return concluded ? (
      <VerdictView
        hunchId={id}
        statement={info.data?.hypothesis.statement}
        archived={info.data?.archivedAt != null}
      />
    ) : (
      <div className="grid gap-5">
        <BeliefMeter belief={belief} />
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
        <CheckIn
          hunchId={id}
          schedule={schedule}
          parameters={parameters}
          phaseAction={phaseAction}
          startsOn={startsOn}
          hasPlan={info.data?.protocol != null}
          firstPhaseAction={info.data?.protocol?.design.phases[0]?.action}
        />
      </div>
    );
  };

  return (
    <>
      <h1 className="m-0 font-heading text-[clamp(30px,4.4vw,48px)] font-bold tracking-[-0.02em] text-ink">
        Your experiment
      </h1>

      {/* The plan is the thing this screen is measuring against, and there was
          no way back to it: the protocol page was reachable from home's setup
          cards and nowhere else once the trial was running. */}
      {info.data?.protocol && (
        <Button
          variant="brand"
          size="touch"
          className="mt-4 border-rule"
          render={<Link href={`/hunch/${id}/protocol`} />}
        >
          <ClipboardListIcon data-icon="inline-start" aria-hidden />
          See the plan
        </Button>
      )}

      <div
        className={cn(
          "mt-[26px] transition-opacity duration-300",
          query.isPending && "opacity-50",
        )}
      >
        {content()}
      </div>

      <div className="mt-12 border-t border-rule pt-2">
        <AbandonHunch hunchId={id} loggedDays={query.data?.checkIns.length ?? 0} />
      </div>
    </>
  );
}
