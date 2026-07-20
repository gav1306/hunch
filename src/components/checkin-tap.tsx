"use client";

import { useState } from "react";
import { useCheckIn } from "@/hooks/use-checkin";
import type { PhaseStatus } from "@/lib/schedule";

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

/**
 * One-tap daily check-in. The phase comes from the schedule (the user never
 * picks it). Binary outcomes get Yes/No buttons; continuous gets a number input.
 * Washout, pre-start, and finished trials show a non-logging message. Brand system.
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
    return <p style={rest}>Your trial hasn&apos;t started yet.</p>;
  }
  if (schedule.done) {
    return <p style={rest}>Trial complete — your verdict is coming soon.</p>;
  }
  if (schedule.washout || schedule.phase === null) {
    return <p style={rest}>Rest day — nothing to log today.</p>;
  }

  const phaseLabel = schedule.kind === "intervention" ? "intervention" : "baseline";
  const disabled = checkIn.isPending;

  return (
    <section
      style={{
        background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
        border: "1px solid var(--rule)",
        padding: "clamp(20px,2.4vw,28px)",
      }}
    >
      <p style={label}>Today</p>
      <p style={{ margin: "8px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 20, letterSpacing: "-0.01em", color: "var(--ink)" }}>
        Phase {schedule.phase}{" "}
        <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 400, color: "var(--muted)" }}>
          ({phaseLabel})
        </span>
      </p>

      {outcomeType === "binary" ? (
        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => checkIn.mutate(1)}
            disabled={disabled}
            style={{ ...btnBase, border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)", opacity: disabled ? 0.5 : 1 }}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => checkIn.mutate(0)}
            disabled={disabled}
            style={{ ...btnBase, border: "1px solid var(--ink)", background: "transparent", color: "var(--ink)", opacity: disabled ? 0.5 : 1 }}
          >
            No
          </button>
        </div>
      ) : (
        <form
          style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}
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
            placeholder="reading"
            style={{ width: 128, padding: "12px 14px", background: "color-mix(in srgb,var(--paper) 82%,var(--ink))", border: "1px solid var(--rule)", color: "var(--ink)", fontFamily: "'Space Mono',monospace", fontSize: 14, outline: "none" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--s1)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
          />
          <button
            type="submit"
            disabled={disabled}
            style={{ ...btnBase, border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)", opacity: disabled ? 0.5 : 1 }}
          >
            Log
          </button>
        </form>
      )}

      {checkIn.isSuccess && (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--muted)" }}>
          Logged ✓ — tap again to change today&apos;s entry.
        </p>
      )}
      {checkIn.isError && (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--s1)" }}>{checkIn.error.message}</p>
      )}
    </section>
  );
}
