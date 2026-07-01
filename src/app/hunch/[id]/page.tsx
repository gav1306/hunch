"use client";

import { use } from "react";
import { BeliefMeter } from "@/components/belief-meter";
import { CheckInTap } from "@/components/checkin-tap";
import { useBelief } from "@/hooks/use-belief";

/**
 * Phase 4 dashboard: the live belief meter plus today's one-tap check-in. The
 * meter narrows as check-ins accumulate (compute-on-read, refreshed on each tap).
 */
export default function HunchDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useBelief(id);

  if (query.isPending) {
    return <main className="mx-auto w-full max-w-2xl p-6 text-sm text-muted-foreground">Loading…</main>;
  }
  if (query.isError) {
    return <main className="mx-auto w-full max-w-2xl p-6 text-sm text-destructive">{query.error.message}</main>;
  }

  const { belief, schedule } = query.data;
  const outcomeType = belief.model === "beta-binomial" ? "binary" : "continuous";

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Your experiment</h1>
      <BeliefMeter belief={belief} />
      <CheckInTap hunchId={id} schedule={schedule} outcomeType={outcomeType} />
    </main>
  );
}
