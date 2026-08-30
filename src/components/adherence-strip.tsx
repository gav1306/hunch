"use client";

import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckIn } from "@/components/check-in";
import { adherenceStrip, adherenceSummary, type AdherenceDay } from "@/lib/adherence";
import { cn } from "@/lib/utils";
import type { ProtocolDesign } from "@/lib/schemas/protocol";
import type { Parameter } from "@/lib/schemas/parameter";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const LABEL = "text-xs tracking-[0.16em] text-muted-foreground uppercase";

/** What each day's tile looks like, and what a screen reader is told it is. */
const STATE: Record<AdherenceDay["state"], { className: string; word: string }> = {
  logged: { className: "border-good bg-good", word: "logged" },
  missed: { className: "border-bad bg-transparent", word: "missed" },
  rest: { className: "border-transparent bg-surface-3", word: "rest day" },
  today: { className: "border-s1 bg-transparent", word: "today, not logged yet" },
  future: { className: "border-rule bg-transparent opacity-65", word: "still to come" },
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
    <section className="min-w-0 rounded-lg border border-rule bg-card p-[clamp(20px,2.4vw,28px)]">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className={cn(LABEL, "m-0 font-normal")}>Your logging</h2>
        <p className="m-0 text-xs text-muted-foreground">
          {elapsed === 0
            ? "Nothing to report yet"
            : `${logged} of ${elapsed} days logged${missed > 0 ? ` · ${missed} missed` : ""}`}
        </p>
      </div>

      <ol className="m-0 mt-4 flex list-none flex-wrap gap-1.5 p-0">
        {strip.map((d) => {
          const tone = STATE[d.state];
          const isOpen = openDay === d.day;
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
                className={cn(
                  "size-[26px] cursor-pointer rounded-md border p-0 outline-offset-2",
                  tone.className,
                  // The phase is the tile's second dimension: baseline days read
                  // flat, intervention days carry the accent underline.
                  d.kind === "intervention" && "shadow-[inset_0_-3px_0_0_var(--s2)]",
                )}
              />
            </li>
          );
        })}
      </ol>

      {selected && (
        <div className="mt-4 border-t border-rule pt-3.5 text-sm leading-relaxed text-ink">
          <p className={cn(LABEL, "mt-0 mb-2")}>
            Day {selected.day} · {DATE_FMT.format(selected.date)}
          </p>
          {selectedEntry ? (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {selectedEntry.values.map((v) => {
                const p = parameters.find((x) => x.id === v.parameterId);
                if (!p) return null;
                return (
                  <li key={v.parameterId} className="flex min-w-0 gap-2.5">
                    <span className="text-muted-foreground [overflow-wrap:anywhere]">
                      {p.label}
                    </span>
                    <span className="font-mono">
                      {p.type === "binary" ? (v.value === 1 ? "yes" : "no") : v.value}
                      {p.unit ? ` ${p.unit}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 text-muted-foreground">
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
              <div className="mt-3.5">
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
