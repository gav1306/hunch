"use client";

import Link from "next/link";
import { useState } from "react";
import { useCheckIn, type CheckInValueInput } from "@/hooks/use-checkin";
import type { PhaseStatus } from "@/lib/schedule";
import { validateParameterValue, type ParameterType } from "@/lib/schemas/parameter";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

const label: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const rest: React.CSSProperties = {
  background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
  border: "1px solid var(--rule)",
  borderRadius: "var(--radius-card)",
  padding: "clamp(20px,2.4vw,28px)",
  fontSize: 13.5,
  color: "var(--muted)",
};

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
 *
 * Same validation, same copy, same promise in both.
 */
export function CheckIn({
  hunchId,
  parameters,
  variant = "full",
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
  variant?: "full" | "compact";
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

  if (!compact) {
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
      return <p style={rest}>Trial complete — your verdict is coming soon.</p>;
    }
    if (schedule.washout || schedule.phase === null) {
      return <p style={rest}>Rest day — nothing to log today.</p>;
    }
  }

  if (parameters.length === 0) {
    return compact ? null : (
      <p style={rest}>Nothing to log — this hunch has no measures yet.</p>
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
    checkIn.mutate(values, { onSuccess: () => onLogged?.() });
  }

  const notices = (
    <>
      {problem && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: 13, color: "var(--s1)" }}>
          {problem}
        </p>
      )}
      {checkIn.isSuccess && !problem && (
        <p
          style={{
            margin: "14px 0 0",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--good)",
          }}
        >
          <CheckIcon aria-hidden className="size-(--icon)" />
          Logged — log again to change today&apos;s entry.
        </p>
      )}
      {checkIn.isError && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: 13, color: "var(--s1)" }}>
          {checkIn.error.message}
        </p>
      )}
    </>
  );

  const fields = shown.map((p) => (
    <div key={p.id} style={{ display: "grid", gap: 8, minWidth: 0 }}>
      <div
        style={{
          fontFamily: p.isPrimary && !compact ? "'Clash Display',sans-serif" : "inherit",
          fontWeight: p.isPrimary && !compact ? 600 : 400,
          fontSize: compact ? 12 : p.isPrimary ? "clamp(16px,2vw,19px)" : 13.5,
          lineHeight: 1.3,
          color: compact || !p.isPrimary ? "var(--muted)" : "var(--ink)",
          overflowWrap: "anywhere",
        }}
      >
        {p.label}
        {p.unit ? (
          <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: "var(--muted)" }}>
            {" "}
            ({p.unit})
          </span>
        ) : null}
      </div>

      {p.type === "binary" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
      ) : (
        <Input
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
  const compactTapsOnly = compact && shown.every((p) => p.type === "binary");

  const form = (
    <form
      // Our own range check words the problem in the parameter's own terms; the
      // browser's native bubble would preempt it and say less.
      noValidate
      style={
        compact
          ? { display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }
          : { marginTop: 18, display: "grid", gap: 16 }
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
          {compact ? "Log" : "Log today"}
        </Button>
      )}
    </form>
  );

  if (compact) {
    return (
      <div>
        {form}
        {notices}
      </div>
    );
  }

  return (
    <section
      style={{
        background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-card)",
        padding: "clamp(20px,2.4vw,28px)",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <p style={label}>
        Log today · Phase {schedule!.phase}{" "}
        <span style={{ textTransform: "none", letterSpacing: "0.04em" }}>
          ({schedule!.kind === "intervention" ? "intervention" : "baseline"})
        </span>
      </p>

      {phaseAction && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            lineHeight: 1.55,
            color: "var(--muted)",
            overflowWrap: "anywhere",
          }}
        >
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
    <section
      style={{
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-card)",
        padding: "20px 18px",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ ...rest, ...label }}>{eyebrowText}</div>

      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--ink)",
          overflowWrap: "anywhere",
        }}
      >
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
