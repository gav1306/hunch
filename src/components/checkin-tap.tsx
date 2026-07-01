"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCheckIn } from "@/hooks/use-checkin";
import type { PhaseStatus } from "@/lib/schedule";

/**
 * One-tap daily check-in. The phase comes from the schedule (the user never
 * picks it). Binary outcomes get Yes/No buttons; continuous gets a number input.
 * Washout, pre-start, and finished trials show a non-logging message.
 */
export function CheckInTap({
  hunchId,
  schedule,
  outcomeType,
}: {
  hunchId: string;
  schedule: PhaseStatus | null;
  outcomeType: "binary" | "continuous";
}) {
  const checkIn = useCheckIn(hunchId);
  const [value, setValue] = useState("");

  if (!schedule || !schedule.started) {
    return <p className="text-sm text-muted-foreground">Your trial hasn&apos;t started yet.</p>;
  }
  if (schedule.done) {
    return <p className="text-sm text-muted-foreground">Trial complete — your verdict is coming soon.</p>;
  }
  if (schedule.washout || schedule.phase === null) {
    return <p className="text-sm text-muted-foreground">Rest day — nothing to log today.</p>;
  }

  const phaseLabel = schedule.kind === "intervention" ? "intervention" : "baseline";

  return (
    <section className="rounded-xl border p-6">
      <p className="text-sm">
        Today: <span className="font-semibold">Phase {schedule.phase}</span> ({phaseLabel})
      </p>

      {outcomeType === "binary" ? (
        <div className="mt-4 flex gap-3">
          <Button size="lg" onClick={() => checkIn.mutate(1)} disabled={checkIn.isPending}>
            Yes
          </Button>
          <Button size="lg" variant="outline" onClick={() => checkIn.mutate(0)} disabled={checkIn.isPending}>
            No
          </Button>
        </div>
      ) : (
        <form
          className="mt-4 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value);
            if (Number.isFinite(n) && value.trim() !== "") checkIn.mutate(n);
          }}
        >
          <input
            type="number"
            step="any"
            aria-label="Today's reading"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-32 rounded-md border px-3 py-2"
            placeholder="reading"
          />
          <Button type="submit" size="lg" disabled={checkIn.isPending}>
            Log
          </Button>
        </form>
      )}

      {checkIn.isSuccess && (
        <p className="mt-3 text-sm text-muted-foreground">Logged ✓ — tap again to change today&apos;s entry.</p>
      )}
      {checkIn.isError && <p className="mt-3 text-sm text-destructive">{checkIn.error.message}</p>}
    </section>
  );
}
