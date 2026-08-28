"use client";

import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckIn } from "@/components/check-in";
import { adherenceStrip, adherenceSummary, type AdherenceDay } from "@/lib/adherence";
import type { ProtocolDesign } from "@/lib/schemas/protocol";
import type { Parameter } from "@/lib/schemas/parameter";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const label: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

/** What each day's tile looks like, and what a screen reader is told it is. */
const STATE: Record<AdherenceDay["state"], { fill: string; border: string; word: string }> = {
  logged: { fill: "var(--good)", border: "var(--good)", word: "logged" },
  missed: { fill: "transparent", border: "var(--bad)", word: "missed" },
  rest: { fill: "var(--surface-3)", border: "transparent", word: "rest day" },
  today: { fill: "transparent", border: "var(--s1)", word: "today, not logged yet" },
  future: { fill: "transparent", border: "var(--rule)", word: "still to come" },
};

/**
 * Every day of the trial, and what happened on it.
 *
 * Home can say a trial is on day 9 of 14. Nothing in the app could say whether
 * those nine days hold nine readings or two — the check-ins were collected
 * daily and shown to nobody, which is also why a five-day gap looked exactly
 * like a perfect week. Tapping a day reads back what was logged on it.
 */
export function AdherenceStrip({
  hunchId,
  startedAt,
  design,
  checkIns,
  parameters,
  today = new Date(),
}: {
  hunchId: string;
  startedAt: Date;
  design: ProtocolDesign;
  checkIns: { loggedOn: string; values: { parameterId: string; value: number }[] }[];
  parameters: Parameter[];
  today?: Date;
}) {
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  /** The saved day is in the belief query, which the mutation already
      invalidates — this just closes the form the user is finished with. */
  function onCorrected() {
    setEditing(null);
  }

  const byDay = new Map(checkIns.map((c) => [new Date(c.loggedOn).getTime(), c]));
  const strip = adherenceStrip({
    startedAt,
    design,
    loggedOn: checkIns.map((c) => new Date(c.loggedOn)),
    today,
  });
  const { logged, missed, elapsed } = adherenceSummary(strip);

  const selected = openDay === null ? null : strip[openDay - 1];
  const selectedEntry = selected ? byDay.get(selected.date.getTime()) : undefined;

  return (
    <section
      style={{
        background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-card)",
        padding: "clamp(20px,2.4vw,28px)",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
        <p style={{ ...label, margin: 0 }}>Your logging</p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
          {elapsed === 0
            ? "Nothing to report yet"
            : `${logged} of ${elapsed} days logged${missed > 0 ? ` · ${missed} missed` : ""}`}
        </p>
      </div>

      <ol
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          margin: "16px 0 0",
          padding: 0,
          listStyle: "none",
        }}
      >
        {strip.map((d) => {
          const tone = STATE[d.state];
          const isOpen = openDay === d.day;
          const readable = d.state === "logged" || d.state === "missed" || d.state === "today";
          return (
            <li key={d.day}>
              <button
                type="button"
                aria-pressed={isOpen}
                aria-label={`Day ${d.day}, ${DATE_FMT.format(d.date)} — ${tone.word}`}
                onClick={() => {
                  setOpenDay(isOpen ? null : d.day);
                  setEditing(null);
                }}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  padding: 0,
                  cursor: "pointer",
                  background: tone.fill,
                  border: `1px solid ${tone.border}`,
                  // The phase is the tile's second dimension: baseline days
                  // read flat, intervention days carry the accent underline.
                  boxShadow:
                    d.kind === "intervention" ? "inset 0 -3px 0 0 var(--s2)" : undefined,
                  outlineOffset: 2,
                  opacity: readable ? 1 : 0.65,
                }}
              />
            </li>
          );
        })}
      </ol>

      {selected && (
        <div
          style={{
            marginTop: 16,
            borderTop: "1px solid var(--rule)",
            paddingTop: 14,
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--ink)",
          }}
        >
          <div style={{ ...label, marginBottom: 8 }}>
            Day {selected.day} · {DATE_FMT.format(selected.date)}
          </div>
          {selectedEntry ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
              {selectedEntry.values.map((v) => {
                const p = parameters.find((x) => x.id === v.parameterId);
                if (!p) return null;
                return (
                  <li key={v.parameterId} style={{ display: "flex", gap: 10, minWidth: 0 }}>
                    <span style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
                      {p.label}
                    </span>
                    <span style={{ fontFamily: "'Space Mono',monospace" }}>
                      {p.type === "binary" ? (v.value === 1 ? "yes" : "no") : v.value}
                      {p.unit ? ` ${p.unit}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {selected.state === "rest"
                ? "A rest day — nothing was due."
                : selected.state === "future"
                  ? "Still to come."
                  : selected.state === "today"
                    ? "Today. Nothing logged yet."
                    : "Nothing was logged on this day."}
            </p>
          )}

          {/* A missed day is recoverable if you remember it, and a reading
              typed wrong shouldn't have to stand for the rest of the trial.
              Rest days and days that haven't happened stay closed — the route
              refuses them either way, and offering the form would be a lie. */}
          {(selected.state === "logged" || selected.state === "missed") &&
            (editing === selected.day ? (
              <div style={{ marginTop: 14 }}>
                <CheckIn
                  variant="correction"
                  hunchId={hunchId}
                  parameters={parameters}
                  loggedOn={selected.date.toISOString()}
                  onLogged={onCorrected}
                />
              </div>
            ) : (
              <Button
                type="button"
                variant="brand"
                size="touch"
                className="mt-3.5"
                onClick={() => setEditing(selected.day)}
              >
                <PencilIcon data-icon="inline-start" aria-hidden />
                {selected.state === "logged" ? "Correct this day" : "Log it now"}
              </Button>
            ))}
        </div>
      )}
    </section>
  );
}
