"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellIcon, BellOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { formatHour, REMINDER_HOURS } from "@/lib/reminders";

type Prefs = { reminderHour: number | null; timeZone: string };

/** The browser's own zone, when it will tell us. */
function browserZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * When the daily reminder goes out.
 *
 * A product that asks for a fortnight of consecutive logging and never says
 * anything between sign-up and the verdict is asking the user to remember it on
 * their own. Starting a trial switches these on at 8pm; this is where the hour
 * moves and where they go off for good.
 *
 * The zone is not a setting. It is read from the browser and re-sent on every
 * save, so a user who moves is reminded on the clock in front of them.
 */
export function ReminderSettings() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [hour, setHour] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/reminders")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Prefs | null) => {
        if (!live || !data) return;
        setPrefs(data);
        if (data.reminderHour !== null) setHour(data.reminderHour);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function save(nextHour: number | null) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reminders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderHour: nextHour, timeZone: browserZone() }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Couldn't save that. Try again.");
      return;
    }
    const data = (await res.json()) as Prefs;
    setPrefs(data);
    toast.success(
      nextHour === null
        ? "Daily reminders are off."
        : `Reminders set for ${formatHour(nextHour)}.`,
    );
  }

  const on = prefs?.reminderHour !== null && prefs !== null;

  return (
    <div
      style={{
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-card)",
        padding: "clamp(20px,2.4vw,28px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 12,
        }}
      >
        {on ? (
          <BellIcon aria-hidden className="size-(--icon)" />
        ) : (
          <BellOffIcon aria-hidden className="size-(--icon)" />
        )}
        Daily reminder
      </div>

      <p style={{ margin: "0 0 18px", fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>
        {prefs === null
          ? "Loading…"
          : on
            ? `One email a day while a trial is running, with what today asks of you. Sent at ${formatHour(prefs.reminderHour!)} — ${prefs.timeZone}.`
            : "Reminders are off. Nothing will nudge you to log, which on a 14-day trial is usually the difference between a verdict and a shrug."}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <Field className="w-auto">
          <FieldLabel
            htmlFor="reminder-hour"
            className="text-xs uppercase tracking-[0.16em] text-muted-foreground"
          >
            Send at
          </FieldLabel>
          <select
            id="reminder-hour"
            value={hour}
            disabled={busy || prefs === null}
            onChange={(e) => setHour(Number(e.target.value))}
            className="h-11 rounded-[var(--radius-control)] border border-input bg-transparent px-3 font-mono text-[16px] text-foreground md:text-sm"
          >
            {REMINDER_HOURS.map((h) => (
              <option key={h} value={h} style={{ background: "var(--paper)" }}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </Field>

        <Button
          type="button"
          variant="brand"
          size="touch"
          disabled={busy || prefs === null}
          className="border-ink bg-ink text-paper"
          onClick={() => save(hour)}
        >
          {busy ? "Saving…" : on ? "Change time" : "Turn on"}
        </Button>

        {on && (
          <Button
            type="button"
            variant="brand"
            size="touch"
            disabled={busy}
            onClick={() => save(null)}
          >
            Turn off
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" style={{ margin: "12px 0 0", fontSize: 12, color: "var(--s1)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
