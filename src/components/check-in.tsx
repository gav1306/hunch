"use client";

import Link from "next/link";
import { useState } from "react";
import { useCheckIn, type CheckInValueInput } from "@/hooks/use-checkin";
import type { PhaseStatus } from "@/lib/schedule";
import {
  SCALE_MAX,
  SCALE_MIN,
  validateParameterValue,
  type ParameterType,
} from "@/lib/schemas/parameter";
import { ArrowRightIcon, CheckIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

/**
 * What logging needs to know about a parameter. Home sends a five-field
 * projection of the row and the dashboard sends the whole thing; neither
 * carries anything else this component reads.
 */
export type LoggableParameter = {
  id: string;
  label: string;
  type: ParameterType;
  unit?: string;
  min?: number | null;
  max?: number | null;
  isPrimary?: boolean;
  sortOrder?: number;
};

const LABEL = "text-xs tracking-[0.16em] text-muted-foreground uppercase";

/** The card this component paints, in all of its shapes. */
const PANEL =
  "rounded-lg border border-rule bg-card p-[clamp(20px,2.4vw,28px)] min-w-0 max-w-full";

/** A day with nothing to log on it — rest, not started, over. */
const REST = `${PANEL} m-0 text-sm text-muted-foreground`;

/**
 * Logging today, on both screens that offer it.
 *
 * Home and the dashboard used to run separate implementations. The dashboard
 * checked every reading against the parameter's own range and said so in the
 * parameter's own words; home parsed the number, and dropped it on the floor if
 * it didn't like it — no message, no logged day. They also disagreed out loud
 * about whether today's entry could be changed: the dashboard said "log again
 * to change today's entry", home said "see you tomorrow". The route upserts, so
 * the dashboard was right and home was telling people the opposite.
 *
 * One component now, in two shapes:
 *
 * - `full` — every parameter, the phase and its instruction, and the states a
 *   trial can be in that aren't "log today" (not started, rest day, finished).
 * - `compact` — the primary parameter alone, inline in a home card. Home has
 *   already decided the hunch is loggable, so this shape renders no gates.
 * - `correction` — every parameter for a day that isn't today, from the
 *   adherence strip. The server decides whether that day can be written to; the
 *   shape only names which one is meant.
 *
 * Same validation, same copy, same promise in both.
 */
export function CheckIn({
  hunchId,
  parameters,
  variant = "full",
  loggedOn,
  schedule,
  phaseAction,
  startsOn,
  hasPlan,
  firstPhaseAction,
  onLogged,
}: {
  hunchId: string;
  /** Everything this hunch tracks; exactly one is primary. */
  parameters: LoggableParameter[];
  variant?: "full" | "compact" | "correction";
  /** ISO day being corrected. `correction` only; today is the default. */
  loggedOn?: string;
  /** Required by `full`, which gates on it. `compact` never reads it. */
  schedule?: PhaseStatus | null;
  /** Today's phase instruction from the protocol, if available. */
  phaseAction?: string;
  /** The anchor, when the trial is scheduled but has not reached day 1. */
  startsOn?: string | null;
  /** Whether a protocol has been designed at all. */
  hasPlan?: boolean;
  /** Day 1's instruction, shown while the user waits for a scheduled start. */
  firstPhaseAction?: string;
  /** Fires once the day is saved, for chrome the caller owns (home's fade). */
  onLogged?: () => void;
}) {
  const checkIn = useCheckIn(hunchId);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const compact = variant === "compact";
  const correction = variant === "correction";

  if (!compact && !correction) {
    if (!schedule || !schedule.started) {
      return (
        <NotStartedYet
          hunchId={hunchId}
          startsOn={schedule ? (startsOn ?? null) : null}
          hasPlan={hasPlan ?? false}
          firstPhaseAction={firstPhaseAction}
        />
      );
    }
    if (schedule.done) {
      return <p className={REST}>Trial complete — your verdict is coming soon.</p>;
    }
    if (schedule.washout || schedule.phase === null) {
      return <p className={REST}>Rest day — nothing to log today.</p>;
    }
  }

  if (parameters.length === 0) {
    return compact || correction ? null : (
      <p className={REST}>Nothing to log — this hunch has no measures yet.</p>
    );
  }

  const disabled = checkIn.isPending;
  const ordered = [...parameters].sort(
    (a, b) =>
      Number(b.isPrimary ?? false) - Number(a.isPrimary ?? false) ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  // Compact logs the one measure the verdict is computed from; the trackers are
  // context, and context belongs on the screen that has room for it.
  const shown = compact ? ordered.slice(0, 1) : ordered;

  function set(id: string, raw: string) {
    setEntries((prev) => ({ ...prev, [id]: raw }));
    setProblem(null);
  }

  /** Collect, validate, send. The one path both shapes submit through. */
  function submit(override?: { id: string; raw: string }) {
    const values: CheckInValueInput[] = [];
    for (const p of shown) {
      const raw = override && override.id === p.id ? override.raw : entries[p.id];
      if (raw === undefined || raw.trim() === "") continue;
      const n = Number(raw);
      const bad = validateParameterValue(p, n);
      if (bad) {
        setProblem(bad);
        return;
      }
      values.push({ parameterId: p.id, value: n });
    }
    if (values.length === 0) {
      setProblem("Log at least one thing before you save.");
      return;
    }
    setProblem(null);
    checkIn.mutate({ values, loggedOn }, { onSuccess: () => onLogged?.() });
  }

  const notices = (
    <>
      {problem && (
        <p role="alert" className="mt-3.5 mb-0 text-sm text-s1">
          {problem}
        </p>
      )}
      {checkIn.isSuccess && !problem && (
        <p className="mt-3.5 mb-0 flex items-center gap-1.5 text-sm text-good">
          <CheckIcon aria-hidden className="size-(--icon)" />
          {correction ? "Saved." : "Logged — log again to change today\u2019s entry."}
        </p>
      )}
      {checkIn.isError && (
        <p role="alert" className="mt-3.5 mb-0 text-sm text-s1">
          {checkIn.error.message}
        </p>
      )}
    </>
  );

  const fields = shown.map((p) => (
    <div key={p.id} className="grid min-w-0 gap-2">
      <label
        htmlFor={`checkin-${p.id}`}
        className={cn(
          "leading-tight [overflow-wrap:anywhere]",
          // The primary measure is the one the verdict is computed from, so on
          // the full form it is set like a heading rather than a field label.
          p.isPrimary && !compact
            ? "font-heading text-[clamp(16px,2vw,19px)] font-semibold text-ink"
            : "text-muted-foreground",
          compact ? "text-xs" : p.isPrimary ? "" : "text-sm",
        )}
      >
        {p.label}
        {p.unit ? (
          <span className="font-mono text-xs text-muted-foreground"> ({p.unit})</span>
        ) : null}
      </label>

      {p.type === "binary" ? (
        <div className="flex flex-wrap gap-2.5">
          {[
            { text: "Yes", v: "1" },
            { text: "No", v: "0" },
          ].map((opt) => {
            const active = entries[p.id] === opt.v;
            return (
              <Button
                key={opt.v}
                type="button"
                variant="brand"
                size="touch"
                disabled={disabled}
                // Compact has no submit button of its own: a tap is the whole
                // interaction, so it logs immediately.
                onClick={() =>
                  compact ? submit({ id: p.id, raw: opt.v }) : set(p.id, opt.v)
                }
                className={active ? "border-ink bg-ink text-paper" : undefined}
              >
                {opt.text}
              </Button>
            );
          })}
        </div>
      ) : p.type === "scale" ? (
        // One tap is the whole interaction, the same as a yes/no — so on home
        // it logs immediately rather than waiting for a submit that isn't there.
        <ToggleGroup
          value={entries[p.id] ? [entries[p.id]] : []}
          onValueChange={(v: string[]) => {
            const next = v[v.length - 1];
            if (!next) return;
            if (compact) submit({ id: p.id, raw: next });
            else set(p.id, next);
          }}
          disabled={disabled}
          aria-label={p.label}
        >
          {Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }, (_, i) =>
            String(SCALE_MIN + i),
          ).map((n) => (
            <ToggleGroupItem
              key={n}
              value={n}
              aria-label={`${p.label}: ${n}`}
              // The registry's default is h-8 — 32px, under the 44px floor the
              // audit already made this app honour everywhere else. This is the
              // control people tap every day, so it matches the yes/no pair
              // beside it rather than the primitive's default.
              className="min-h-11 min-w-11 border border-rule font-mono text-sm aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
            >
              {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : p.type === "count" ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="brand"
            size="touch"
            disabled={disabled || Number(entries[p.id] ?? 0) <= 0}
            aria-label={`One fewer: ${p.label}`}
            onClick={() => set(p.id, String(Math.max(0, Number(entries[p.id] ?? 0) - 1)))}
          >
            <MinusIcon aria-hidden className="size-icon" />
          </Button>
          <output
            aria-live="polite"
            className="w-10 text-center font-mono text-lg text-ink"
          >
            {entries[p.id] ?? 0}
          </output>
          <Button
            type="button"
            variant="brand"
            size="touch"
            disabled={disabled}
            aria-label={`One more: ${p.label}`}
            onClick={() => set(p.id, String(Number(entries[p.id] ?? 0) + 1))}
          >
            <PlusIcon aria-hidden className="size-icon" />
          </Button>
        </div>
      ) : (
        <Input
          id={`checkin-${p.id}`}
          type="number"
          step="any"
          min={p.min ?? undefined}
          max={p.max ?? undefined}
          aria-label={p.label}
          value={entries[p.id] ?? ""}
          onChange={(e) => set(p.id, e.target.value)}
          placeholder={p.min != null && p.max != null ? `${p.min}–${p.max}` : "reading"}
          className="w-32 font-mono"
        />
      )}
    </div>
  ));

  // The one measure being a yes/no is the whole of compact's interaction; there
  // is nothing left to submit.
  // A scale is a single tap too, so home has nothing left to submit for it
  // either. A count is not: the stepper needs a confirming press.
  const compactTapsOnly =
    compact && shown.every((p) => p.type === "binary" || p.type === "scale");

  const form = (
    <form
      // Our own range check words the problem in the parameter's own terms; the
      // browser's native bubble would preempt it and say less.
      noValidate
      className={
        compact ? "flex flex-wrap items-end gap-2.5" : "mt-[18px] grid gap-4"
      }
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {fields}
      {!compactTapsOnly && (
        <Button
          type="submit"
          variant="brand"
          size="touch"
          disabled={disabled}
          className="justify-self-start border-ink bg-ink text-paper"
        >
          {compact ? "Log" : correction ? "Save this day" : "Log today"}
        </Button>
      )}
    </form>
  );

  if (compact || correction) {
    return (
      <div>
        {form}
        {notices}
      </div>
    );
  }

  return (
    <section className={PANEL}>
      <p className={cn(LABEL, "mt-0 mb-0")}>
        Log today · Phase {schedule!.phase}{" "}
        <span className="tracking-[0.04em] normal-case">
          ({schedule!.kind === "intervention" ? "intervention" : "baseline"})
        </span>
      </p>

      {phaseAction && (
        <p className="mt-2 mb-0 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {phaseAction}
        </p>
      )}

      {form}
      {notices}
    </section>
  );
}

/** "tomorrow", "in 3 days" — how far off a scheduled start is. */
function startsIn(iso: string): string {
  const start = new Date(iso);
  const now = new Date();
  const days = Math.round(
    (Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()) -
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
      86_400_000,
  );
  return days <= 1 ? "tomorrow" : `in ${days} days`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * A trial that has not begun. Two cases, and neither is a dead end:
 * the plan hasn't been designed (send them to design it), or it has been
 * designed and anchored on a future day (tell them which day, and what day 1
 * asks of them).
 */
function NotStartedYet({
  hunchId,
  startsOn,
  hasPlan,
  firstPhaseAction,
}: {
  hunchId: string;
  startsOn: string | null;
  hasPlan: boolean;
  firstPhaseAction?: string;
}) {
  const scheduled = startsOn !== null;
  const eyebrowText = scheduled
    ? `Starts ${startsIn(startsOn)} · ${DATE_FMT.format(new Date(startsOn))}`
    : hasPlan
      ? "Plan ready"
      : "No plan yet";

  return (
    <section className="grid gap-3.5 rounded-lg border border-rule px-[18px] py-5">
      <p className={cn(LABEL, "m-0")}>{eyebrowText}</p>

      <p className="m-0 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
        {scheduled
          ? firstPhaseAction
            ? `Day 1 is a baseline day. ${firstPhaseAction}`
            : "Day 1 hasn't come round yet — nothing to log until it does."
          : hasPlan
            ? "Your plan is designed and waiting. Nothing runs until you start it."
            : "This hunch doesn't have a plan yet. Design one and you can start logging."}
      </p>

      <Button
        variant="brand"
        size="touch"
        className={
          scheduled
            ? "justify-self-start border-primary text-primary"
            : "justify-self-start border-primary bg-primary text-primary-foreground"
        }
        render={<Link href={`/hunch/${hunchId}/protocol`} />}
      >
        {scheduled ? "See the full plan" : hasPlan ? "Start it" : "Design your plan"}
        <ArrowRightIcon data-icon="inline-end" aria-hidden />
      </Button>
    </section>
  );
}
