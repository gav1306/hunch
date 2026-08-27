"use client";

import Link from "next/link";
import { useState } from "react";
import type { Confounder, PowerInfo, ProtocolDesign } from "@/lib/schemas/protocol";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const mono = "'Space Mono',monospace";

/**
 * The approved protocol as a walk-through, not a wall. One phase fills the
 * screen at a time; a tappable A→B→A timeline shows where you are; the design
 * rationale (controls + power) folds away under "Why this design". The last
 * phase reveals the Start button. Brand system — Clash Display / Space Mono,
 * --ink/--paper/--rule/--s1.
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
    <section style={{ minWidth: 0, maxWidth: "100%", display: "grid", gap: 20 }}>
      <style>{`
        @keyframes hunch-phase-in { from { opacity: 0; transform: translateX(var(--hx,14px)); } to { opacity: 1; transform: none; } }
        @keyframes hunch-seg-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) {
          .hunch-phase, .hunch-seg-fill { animation: none !important; }
        }
      `}</style>

      {/* What you're testing */}
      <div
        style={{
          background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
          border: "1px solid var(--rule)",
          borderLeft: "2px solid var(--s1)",
          borderRadius: 14,
          padding: "clamp(16px,2vw,20px)",
          minWidth: 0,
        }}
      >
        <div style={label}>What you&apos;re testing</div>
        <h2 style={{ margin: "8px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(17px,2.1vw,21px)", lineHeight: 1.28, letterSpacing: "-0.01em", color: "var(--ink)", overflowWrap: "anywhere" }}>
          {hypothesis.statement}
        </h2>
        <p style={{ margin: "10px 0 0", fontFamily: mono, fontSize: 11.5, color: "var(--muted)", overflowWrap: "anywhere" }}>
          Measured by {hypothesis.outcomeMetric}
        </p>
      </div>

      {/* Timeline */}
      <div style={{ display: "flex", alignItems: "center", padding: "0 2px" }}>
        {phases.map((p, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <div key={i} style={{ display: "contents" }}>
              <button
                type="button"
                aria-label={`Phase ${i + 1}: ${p.name}`}
                aria-current={active}
                onClick={() => go(i)}
                style={{
                  flex: "0 0 auto",
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  fontFamily: mono,
                  fontWeight: 700,
                  fontSize: 13,
                  transition: "all .3s ease",
                  border: `1px solid ${active ? "var(--s1)" : done ? "var(--ink)" : "var(--rule)"}`,
                  background: active ? "var(--s1)" : "var(--paper)",
                  color: active ? "var(--paper)" : done ? "var(--ink)" : "var(--muted)",
                  transform: active ? "scale(1.08)" : "none",
                }}
              >
                {p.label}
              </button>
              {i < phases.length - 1 && (
                <span style={{ flex: "1 1 auto", height: 1, background: "var(--rule)", position: "relative", overflow: "hidden" }}>
                  {done && (
                    <span
                      className="hunch-seg-fill"
                      style={{ position: "absolute", inset: 0, background: "var(--s1)", transformOrigin: "left", animation: "hunch-seg-grow .35s ease both" }}
                    />
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {design.washoutDays > 0 && (
        <p style={{ margin: "-8px 0 0", ...label }}>{design.washoutDays}-day washout between phases</p>
      )}

      {/* One phase */}
      <div style={{ overflow: "hidden", minWidth: 0 }}>
        <div
          key={idx}
          className="hunch-phase"
          style={{
            ["--hx" as string]: `${dir * 14}px`,
            animation: "hunch-phase-in .32s cubic-bezier(.2,.7,.2,1) both",
            borderRadius: 16,
            border: `1px solid ${intervention ? "color-mix(in srgb,var(--s1) 55%,var(--rule))" : "var(--rule)"}`,
            background: intervention
              ? "color-mix(in srgb,var(--s1) 8%,color-mix(in srgb,var(--paper) 90%,var(--ink)))"
              : "color-mix(in srgb,var(--paper) 90%,var(--ink))",
            padding: "clamp(18px,2.2vw,24px)",
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 13, width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center", border: `1px solid ${intervention ? "var(--s1)" : "var(--rule)"}`, color: intervention ? "var(--s1)" : "var(--muted)" }}>
              {phase.label}
            </span>
            <span style={label}>{intervention ? "Intervention" : "Baseline"}</span>
            <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 11.5, color: "var(--muted)" }}>{phase.days} days</span>
          </div>
          <h3 style={{ margin: "14px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(19px,2.4vw,24px)", lineHeight: 1.18, letterSpacing: "-0.01em", color: "var(--ink)", overflowWrap: "anywhere" }}>
            {phase.name}
          </h3>
          <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--muted)", overflowWrap: "anywhere" }}>
            {phase.action}
          </p>
        </div>
      </div>

      {/* Step nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <button
          type="button"
          onClick={() => go(idx - 1)}
          disabled={idx === 0}
          style={{ ...navBtn, background: "transparent", color: "var(--ink)", opacity: idx === 0 ? 0.3 : 1, cursor: idx === 0 ? "not-allowed" : "pointer" }}
        >
          ← back
        </button>
        <span style={{ fontFamily: mono, fontSize: 11, color: "var(--muted)" }}>
          phase {idx + 1} / {phases.length}
        </span>
        {last ? (
          <Link href={`/hunch/${hunchId}`} style={{ ...navBtn, textDecoration: "none", border: "1px solid var(--s1)", background: "var(--s1)", color: "var(--paper)" }}>
            Start experiment →
          </Link>
        ) : (
          <button type="button" onClick={() => go(idx + 1)} style={{ ...navBtn, border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)" }}>
            next →
          </button>
        )}
      </div>

      {/* Why this design */}
      <details style={{ borderTop: "1px solid var(--rule)", paddingTop: 4 }}>
        <summary
          style={{ listStyle: "none", cursor: "pointer", padding: "10px 2px", display: "flex", alignItems: "center", justifyContent: "space-between", ...label }}
        >
          Why this design
          <span aria-hidden style={{ color: "var(--s1)", fontSize: 15 }}>+</span>
        </summary>
        <div style={{ display: "grid", gap: 14, padding: "4px 2px 10px" }}>
          {confounders.length > 0 && (
            <div>
              <div style={{ ...label, marginBottom: 6 }}>Keep these steady</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {confounders.map((c) => (
                  <li key={c.name} style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.5, color: "var(--ink)", minWidth: 0 }}>
                    <span aria-hidden style={{ color: "var(--s1)" }}>·</span>
                    <span style={{ overflowWrap: "anywhere" }}>{c.control}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div style={{ ...label, marginBottom: 6 }}>Why A → B → A</div>
            <p style={{ margin: 0, fontSize: 12.5, fontStyle: "italic", lineHeight: 1.6, color: "var(--muted)", overflowWrap: "anywhere" }}>
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

const navBtn: React.CSSProperties = {
  fontFamily: mono,
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "12px 18px",
  borderRadius: 11,
  border: "1px solid var(--rule)",
};
