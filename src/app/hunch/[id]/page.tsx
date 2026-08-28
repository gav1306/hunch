"use client";

import { use } from "react";
import { BeliefMeter } from "@/components/belief-meter";
import { CheckIn } from "@/components/check-in";
import { AbandonHunch } from "@/components/hunch/abandon-hunch";
import { VerdictView } from "@/components/verdict";
import { useBelief } from "@/hooks/use-belief";
import { useHunchInfo } from "@/hooks/use-hunch-info";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

/**
 * Phase 4 dashboard: the live belief meter plus today's one-tap check-in. The
 * meter narrows as check-ins accumulate (compute-on-read, refreshed on each tap).
 * The frame — ground, header, column — comes from the slim AppShell in
 * `/hunch/layout.tsx`.
 */
export default function HunchDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useBelief(id);
  const info = useHunchInfo(id);

  const content = () => {
    if (query.isPending) {
      return <p style={{ ...label, textTransform: "none", letterSpacing: "0.04em" }}>Loading…</p>;
    }
    if (query.isError) {
      return <p style={{ fontSize: 13, color: "var(--s1)" }}>{query.error.message}</p>;
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
      <VerdictView hunchId={id} />
    ) : (
      <div style={{ display: "grid", gap: 20 }}>
        <BeliefMeter belief={belief} />
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
      <h1 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(30px,4.4vw,48px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
        Your experiment
      </h1>

      <div style={{ marginTop: 26, transition: "opacity 300ms ease", opacity: query.isPending ? 0.5 : 1 }}>{content()}</div>

      <div style={{ marginTop: 48, borderTop: "1px solid var(--rule)", paddingTop: 8 }}>
        <AbandonHunch hunchId={id} loggedDays={query.data?.checkIns.length ?? 0} />
      </div>
    </>
  );
}
