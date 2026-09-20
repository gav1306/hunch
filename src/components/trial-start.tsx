"use client";

import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { useStartTrial } from "@/hooks/use-start-trial";
import type { ProtocolDesign } from "@/lib/schemas/protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LABEL = "text-xs tracking-[0.16em] text-muted-foreground uppercase";

/**
 * The only place a trial begins. Two choices rather than one button, because
 * the anchor is a calendar day: reading the plan at 11pm and starting "now"
 * spends a baseline day on an hour of sleep.
 *
 * Lifted out of `ProtocolStepper`, where it used to be the reveal under the
 * last phase, so an observational window's single card can end the same way.
 * `firstPhase` is optional: a phased trial's last phase isn't necessarily
 * phase 1 (an ABA design's last panel is the second baseline), so naming what
 * day 1 actually is still earns its place there. An observational card has
 * already said what to do one paragraph up, so it leaves `firstPhase` out
 * rather than repeat itself.
 */
export function TrialStart({
  hunchId,
  firstPhase,
}: {
  hunchId: string;
  firstPhase?: ProtocolDesign["phases"][number];
}) {
  const router = useRouter();
  const start = useStartTrial(hunchId);

  return (
    <div className="grid gap-3.5 border-t border-rule pt-[18px]">
      <div>
        <p className={cn(LABEL, "mt-0 mb-1.5")}>Ready when you are</p>
        <p className="m-0 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
          {firstPhase && (
            <>
              Day 1 is {firstPhase.name.toLowerCase()}. {firstPhase.action}{" "}
            </>
          )}
          Nothing is running until you pick a day — starting tomorrow gives you a
          full first day instead of whatever is left of this one.
        </p>
      </div>

      {start.error && (
        <p role="alert" className="m-0 text-sm leading-normal text-s1">
          {start.error.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <Button
          type="button"
          variant="brand"
          size="touch"
          disabled={start.isPending}
          onClick={() =>
            start.mutate("today", { onSuccess: () => router.push(`/hunch/${hunchId}`) })
          }
          className="border-s1 bg-s1 font-bold text-paper hover:bg-s1"
        >
          {start.isPending ? (
            "Starting…"
          ) : (
            <>
              Start today
              <ArrowRightIcon aria-hidden className="ml-1.5 inline-block size-(--icon) align-[-0.15em]" />
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="brand"
          size="touch"
          disabled={start.isPending}
          onClick={() =>
            start.mutate("tomorrow", { onSuccess: () => router.push(`/hunch/${hunchId}`) })
          }
          className="border-rule font-bold"
        >
          Start tomorrow
        </Button>
      </div>
    </div>
  );
}
