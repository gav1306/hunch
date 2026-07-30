"use client";

import Link from "next/link";
import { use } from "react";
import { BeliefMeter } from "@/components/belief-meter";
import { CheckInTap } from "@/components/checkin-tap";
import { VerdictView } from "@/components/verdict";
import { useBelief } from "@/hooks/use-belief";
import { useHunchInfo } from "@/hooks/use-hunch-info";
import { appThemeStyle } from "@/lib/app-theme";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

/**
 * Phase 4 dashboard: the live belief meter plus today's one-tap check-in. The
 * meter narrows as check-ins accumulate (compute-on-read, refreshed on each tap).
 * Shell-less authed page — spreads appThemeStyle() onto its own root.
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

    const { belief, schedule } = query.data;
    const outcomeType = belief.model === "beta-binomial" ? "binary" : "continuous";
    const concluded = schedule?.done ?? false;

    const outcomeMetric = info.data?.hypothesis.outcomeMetric;
    // Today's instruction: the design phase matching the phase we're logging.
    const phaseAction = info.data?.protocol?.design.phases.find(
      (p) => p.label === schedule?.phase,
    )?.action;

    return concluded ? (
      <VerdictView hunchId={id} />
    ) : (
      <div style={{ display: "grid", gap: 20 }}>
        <BeliefMeter belief={belief} />
        <CheckInTap
          hunchId={id}
          schedule={schedule}
          outcomeType={outcomeType}
          outcomeMetric={outcomeMetric}
          phaseAction={phaseAction}
        />
      </div>
    );
  };

  return (
    <main style={{ minHeight: "100dvh", ...appThemeStyle() }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(20px,6vh,56px) 20px 96px" }}>
        <Link href="/home" style={{ ...label, textDecoration: "none" }}>← home</Link>

        <h1 style={{ margin: "40px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(30px,4.4vw,48px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
          Your experiment
        </h1>

        <div style={{ marginTop: 26, transition: "opacity 300ms ease", opacity: query.isPending ? 0.5 : 1 }}>{content()}</div>
      </div>
    </main>
  );
}
