"use client";

import Link from "next/link";
import { useState } from "react";
import { useCheckIn, type CheckInValueInput } from "@/hooks/use-checkin";
import type { PhaseStatus } from "@/lib/schedule";
import { validateParameterValue, type Parameter } from "@/lib/schemas/parameter";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const rest: React.CSSProperties = {
  background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
  border: "1px solid var(--rule)",
  padding: "clamp(20px,2.4vw,28px)",
  fontSize: 13.5,
  color: "var(--muted)",
};

const btnBase: React.CSSProperties = {
  padding: "13px 26px",
  fontFamily: "'Space Mono',monospace",
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const input: React.CSSProperties = {
  width: 128,
  padding: "12px 14px",
  background: "color-mix(in srgb,var(--paper) 82%,var(--ink))",
  border: "1px solid var(--rule)",
  borderRadius: 9,
  color: "var(--ink)",
  fontFamily: "'Space Mono',monospace",
  fontSize: 14,
  outline: "none",
};

/**
 * The daily log. One input per parameter — the primary first and emphasized,
 * trackers under it — submitted together. The phase comes from the schedule (the
 * user never picks it). Blank rows are simply not sent, so partial days are fine.
 * Washout and finished trials show a non-logging message. A trial that has not
 * begun gets a way forward instead of a full stop: this used to render the bare
 * sentence "Your trial hasn't started yet." with no onward link, which made the
 * dashboard the dead end that home's setup card pointed at. Brand system.
 */
export function CheckInTap({
  hunchId,
  schedule,
  parameters,
  phaseAction,
  startsOn,
  hasPlan,
  firstPhaseAction,
}: {
  hunchId: string;
  schedule: PhaseStatus | null;
  /** Everything this hunch tracks; exactly one is primary. */
  parameters: Parameter[];
  /** Today's phase instruction from the protocol, if available. */
  phaseAction?: string;
  /** The anchor, when the trial is scheduled but has not reached day 1. */
  startsOn?: string | null;
  /** Whether a protocol has been designed at all. */
  hasPlan?: boolean;
  /** Day 1's instruction, shown while the user waits for a scheduled start. */
  firstPhaseAction?: string;
}) {
  const checkIn = useCheckIn(hunchId);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

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
  if (parameters.length === 0) {
    return <p style={rest}>Nothing to log — this hunch has no measures yet.</p>;
  }

  const phaseLabel = schedule.kind === "intervention" ? "intervention" : "baseline";
  const disabled = checkIn.isPending;
  const ordered = [...parameters].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  );

  function set(id: string, raw: string) {
    setEntries((prev) => ({ ...prev, [id]: raw }));
    setProblem(null);
  }

  function submit() {
    const values: CheckInValueInput[] = [];
    for (const p of ordered) {
      const raw = entries[p.id];
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
    checkIn.mutate(values);
  }

  return (
    <section
      style={{
        background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
        border: "1px solid var(--rule)",
        padding: "clamp(20px,2.4vw,28px)",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <p style={label}>
        Log today · Phase {schedule.phase}{" "}
        <span style={{ textTransform: "none", letterSpacing: "0.04em" }}>({phaseLabel})</span>
      </p>

      {phaseAction && (
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--muted)", overflowWrap: "anywhere" }}>
          {phaseAction}
        </p>
      )}

      <form
        // Our own range check words the problem in the parameter's own terms;
        // the browser's native bubble would preempt it and say less.
        noValidate
        style={{ marginTop: 18, display: "grid", gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {ordered.map((p) => (
          <div key={p.id} style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <div
              style={{
                fontFamily: p.isPrimary ? "'Clash Display',sans-serif" : "inherit",
                fontWeight: p.isPrimary ? 600 : 400,
                fontSize: p.isPrimary ? "clamp(16px,2vw,19px)" : 13.5,
                lineHeight: 1.3,
                color: p.isPrimary ? "var(--ink)" : "var(--muted)",
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
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => set(p.id, opt.v)}
                      disabled={disabled}
                      style={{
                        ...btnBase,
                        borderRadius: 9,
                        border: "1px solid var(--ink)",
                        background: active ? "var(--ink)" : "transparent",
                        color: active ? "var(--paper)" : "var(--ink)",
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      {opt.text}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="number"
                step="any"
                min={p.min ?? undefined}
                max={p.max ?? undefined}
                aria-label={p.label}
                value={entries[p.id] ?? ""}
                onChange={(e) => set(p.id, e.target.value)}
                placeholder={p.min != null && p.max != null ? `${p.min}–${p.max}` : "reading"}
                style={input}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--s1)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
              />
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={disabled}
          style={{
            ...btnBase,
            justifySelf: "start",
            borderRadius: 9,
            border: "1px solid var(--ink)",
            background: "var(--ink)",
            color: "var(--paper)",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Log today
        </button>
      </form>

      {problem && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: 13, color: "var(--s1)" }}>{problem}</p>
      )}
      {checkIn.isSuccess && !problem && (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--muted)" }}>
          Logged ✓ — log again to change today&apos;s entry.
        </p>
      )}
      {checkIn.isError && (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--s1)" }}>{checkIn.error.message}</p>
      )}
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
        borderRadius: 14,
        padding: "20px 18px",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ ...rest, ...label }}>{eyebrowText}</div>

      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--ink)", overflowWrap: "anywhere" }}>
        {scheduled
          ? firstPhaseAction
            ? `Day 1 is a baseline day. ${firstPhaseAction}`
            : "Day 1 hasn't come round yet — nothing to log until it does."
          : hasPlan
            ? "Your plan is designed and waiting. Nothing runs until you start it."
            : "This hunch doesn't have a plan yet. Design one and you can start logging."}
      </p>

      <Link
        href={`/hunch/${hunchId}/protocol`}
        style={{
          justifySelf: "start",
          fontFamily: "'Space Mono',monospace",
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          padding: "12px 18px",
          borderRadius: 11,
          textDecoration: "none",
          border: "1px solid var(--s1)",
          background: scheduled ? "transparent" : "var(--s1)",
          color: scheduled ? "var(--s1)" : "var(--paper)",
        }}
      >
        {scheduled ? "See the full plan →" : hasPlan ? "Start it →" : "Design your plan →"}
      </Link>
    </section>
  );
}
