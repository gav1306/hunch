"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { useStartTrial } from "@/hooks/use-start-trial";
import type { StartOn } from "@/lib/schedule";
import type { Confounder, PowerInfo, ProtocolDesign } from "@/lib/schemas/protocol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LABEL = "text-xs tracking-[0.16em] text-muted-foreground uppercase";

/**
 * The approved protocol as a walk-through, not a wall. One phase fills the
 * screen at a time; a tappable A→B→A timeline shows where you are; the design
 * rationale (controls + power) folds away under "Why this design". The last
 * phase reveals the start block. Brand system — Clash Display / Space Mono,
 * --ink/--paper/--rule/--s1.
 *
 * That block is where the trial actually begins. It used to be a plain link to
 * the dashboard, because designing the protocol had already stamped the start
 * date — so the button said "Start experiment" while starting nothing, and the
 * anchor was however long ago the design finished. Now nothing is running until
 * the user picks a day here.
 */
export function ProtocolStepper({
  hunchId,
  hypothesis,
  design,
  powerInfo,
  confounders,
}: {
  hunchId: string;
  hypothesis: { statement: string; outcomeMetric: string };
  design: ProtocolDesign;
  powerInfo: PowerInfo;
  confounders: Confounder[];
}) {
  const phases = design.phases;
  const router = useRouter();
  const start = useStartTrial(hunchId);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(0);
  const phase = phases[idx];
  const intervention = phase.kind === "intervention";
  const last = idx === phases.length - 1;

  const go = (to: number) => {
    const t = Math.max(0, Math.min(phases.length - 1, to));
    setDir(t > idx ? 1 : t < idx ? -1 : 0);
    setIdx(t);
  };

  return (
    <section className="grid max-w-full min-w-0 gap-5">
      <style>{`
        @keyframes hunch-phase-in { from { opacity: 0; transform: translateX(var(--hx,14px)); } to { opacity: 1; transform: none; } }
        @keyframes hunch-seg-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) {
          .hunch-phase, .hunch-seg-fill { animation: none !important; }
        }
      `}</style>

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

      {/* Timeline */}
      <div className="flex items-center px-0.5">
        {phases.map((p, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <div key={i} className="contents">
              {/* 44px, not 34: this is the control that moves you through the
                  plan on a phone, and it was the smallest tap target left. */}
              <button
                type="button"
                aria-label={`Phase ${i + 1}: ${p.name}`}
                aria-current={active}
                onClick={() => go(i)}
                className={cn(
                  "grid size-11 flex-none cursor-pointer place-items-center rounded-full border font-mono text-sm font-bold transition-all duration-300",
                  active
                    ? "scale-108 border-s1 bg-s1 text-paper"
                    : done
                      ? "border-ink bg-paper text-ink"
                      : "border-rule bg-paper text-muted-foreground",
                )}
              >
                {p.label}
              </button>
              {i < phases.length - 1 && (
                <span className="relative h-px flex-auto overflow-hidden bg-rule">
                  {done && (
                    <span className="hunch-seg-fill absolute inset-0 origin-left animate-[hunch-seg-grow_.35s_ease_both] bg-s1" />
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {design.washoutDays > 0 && (
        <p className={cn(LABEL, "-mt-2 mb-0")}>
          {design.washoutDays}-day washout between phases
        </p>
      )}

      {/* One phase */}
      <div className="min-w-0 overflow-hidden">
        <div
          key={idx}
          className={cn(
            "hunch-phase min-w-0 rounded-xl border p-[clamp(18px,2.2vw,24px)] animate-[hunch-phase-in_.32s_cubic-bezier(.2,.7,.2,1)_both]",
            intervention
              ? "border-[color-mix(in_srgb,var(--s1)_55%,var(--rule))] bg-[color-mix(in_srgb,var(--s1)_8%,var(--card))]"
              : "border-rule bg-card",
          )}
          style={{ ["--hx" as string]: `${dir * 14}px` }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "grid size-[26px] place-items-center rounded-md border font-mono text-sm font-bold",
                intervention ? "border-s1 text-s1" : "border-rule text-muted-foreground",
              )}
            >
              {phase.label}
            </span>
            <span className={LABEL}>{intervention ? "Intervention" : "Baseline"}</span>
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
        </div>
      </div>

      {/* Step nav */}
      <div className="flex items-center justify-between gap-2.5">
        <Button
          type="button"
          variant="brand"
          size="touch"
          onClick={() => go(idx - 1)}
          disabled={idx === 0}
          className="border-rule font-bold"
        >
          <ArrowLeftIcon data-icon="inline-start" aria-hidden />
          back
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          phase {idx + 1} / {phases.length}
        </span>
        {last ? (
          <span aria-hidden className="invisible" />
        ) : (
          <Button
            type="button"
            variant="brand"
            size="touch"
            onClick={() => go(idx + 1)}
            className="border-ink bg-ink font-bold text-paper"
          >
            next
            <ArrowRightIcon data-icon="inline-end" aria-hidden />
          </Button>
        )}
      </div>

      {last && (
        <StartBlock
          firstPhase={phases[0]}
          pending={start.isPending}
          error={start.error?.message ?? null}
          onStart={(startOn) =>
            start.mutate(startOn, { onSuccess: () => router.push(`/hunch/${hunchId}`) })
          }
        />
      )}

      {/* Why this design */}
      <details className="group border-t border-rule pt-1">
        <summary
          className={cn(
            LABEL,
            "flex h-11 cursor-pointer list-none items-center justify-between px-0.5",
          )}
        >
          Why this design
          <span aria-hidden className="text-base text-s1 group-open:hidden">
            +
          </span>
          <span aria-hidden className="hidden text-base text-s1 group-open:inline">
            −
          </span>
        </summary>
        <div className="grid gap-3.5 px-0.5 pt-1 pb-2.5">
          {confounders.length > 0 && (
            <div>
              <p className={cn(LABEL, "mt-0 mb-1.5")}>Keep these steady</p>
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {confounders.map((c) => (
                  <li key={c.name} className="flex min-w-0 gap-2 text-sm leading-normal text-ink">
                    <span aria-hidden className="text-s1">
                      ·
                    </span>
                    <span className="[overflow-wrap:anywhere]">{c.control}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className={cn(LABEL, "mt-0 mb-1.5")}>Why A → B → A</p>
            <p className="m-0 text-xs leading-relaxed text-muted-foreground italic [overflow-wrap:anywhere]">
              The phases repeat so the change has to prove itself: if your {hypothesis.outcomeMetric}{" "}
              moves during the intervention and settles back afterward, the change caused it — not a
              lucky stretch. {powerInfo.rationale}
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

/**
 * The only place a trial begins. Two choices rather than one button, because
 * the anchor is a calendar day: reading the plan at 11pm and starting "now"
 * spends a baseline day on an hour of sleep.
 */
function StartBlock({
  firstPhase,
  pending,
  error,
  onStart,
}: {
  firstPhase: ProtocolDesign["phases"][number];
  pending: boolean;
  error: string | null;
  onStart: (startOn: StartOn) => void;
}) {
  return (
    <div className="grid gap-3.5 border-t border-rule pt-[18px]">
      <div>
        <p className={cn(LABEL, "mt-0 mb-1.5")}>Ready when you are</p>
        <p className="m-0 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
          Day 1 is {firstPhase.name.toLowerCase()}. {firstPhase.action} Nothing is
          running until you pick a day — starting tomorrow gives you a full first
          day instead of whatever is left of this one.
        </p>
      </div>

      {error && (
        <p role="alert" className="m-0 text-sm leading-normal text-s1">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2.5">
        <Button
          type="button"
          variant="brand"
          size="touch"
          disabled={pending}
          onClick={() => onStart("today")}
          className="border-s1 bg-s1 font-bold text-paper hover:bg-s1"
        >
          {pending ? (
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
          disabled={pending}
          onClick={() => onStart("tomorrow")}
          className="border-rule font-bold"
        >
          Start tomorrow
        </Button>
      </div>
    </div>
  );
}

