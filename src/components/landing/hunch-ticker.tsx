"use client";

import { Reveal } from "./motion-primitives";

const ROW_A = [
  { q: "Does a 10-min walk beat my afternoon coffee?", tag: "Energy" },
  { q: "No Slack before noon = more shipped?", tag: "Work" },
  { q: "Do I sleep better skipping the nightcap?", tag: "Sleep" },
  { q: "Does daily stretching ease my back?", tag: "Body" },
  { q: "Standing desk = fewer 3pm slumps?", tag: "Energy" },
  { q: "Does gratitude journaling lift my week?", tag: "Mind" },
];

const ROW_B = [
  { q: "Do I read more with my phone in a drawer?", tag: "Focus" },
  { q: "Does lo-fi actually help me code?", tag: "Focus" },
  { q: "Earlier dinner = lighter mornings?", tag: "Body" },
  { q: "Do cold plunges cut my soreness?", tag: "Body" },
  { q: "Does saying no free up my week?", tag: "Life" },
  { q: "One coffee vs two — same focus?", tag: "Focus" },
];

function Chip({ q, tag }: { q: string; tag: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        flex: "0 0 auto",
        marginRight: 14,
        padding: "12px 18px",
        border: "1px solid var(--rule)",
        background: "color-mix(in srgb, var(--paper) 90%, var(--ink))",
        fontSize: "clamp(12px,1vw,14px)",
        color: "var(--ink)",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ color: "var(--s1)" }}>✦</span>
      {q}
      <span
        style={{
          fontSize: 9.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          borderLeft: "1px solid var(--rule)",
          paddingLeft: 12,
        }}
      >
        {tag}
      </span>
    </span>
  );
}

function Row({
  items,
  reverse,
}: {
  items: { q: string; tag: string }[];
  reverse?: boolean;
}) {
  const doubled = [...items, ...items];
  return (
    <div style={{ overflow: "hidden", width: "100%" }}>
      <div
        style={{
          display: "flex",
          width: "max-content",
          animation: `${reverse ? "hl-marquee-rev" : "hl-marquee"} 34s linear infinite`,
        }}
      >
        {doubled.map((it, i) => (
          <Chip key={`${it.q}-${i}`} q={it.q} tag={it.tag} />
        ))}
      </div>
    </div>
  );
}

export function HunchTicker() {
  return (
    <section
      style={{
        position: "relative",
        padding: "clamp(48px,8vh,96px) 0",
        overflow: "hidden",
      }}
    >
      <h2 className="sr-only">What people are testing</h2>
      <Reveal y={24}>
        <div
          style={{
            padding: "0 clamp(30px,3.6vw,52px)",
            marginBottom: "clamp(22px,3vh,34px)",
            fontSize: 11.5,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          <span aria-hidden style={{ color: "var(--s1)" }}>✦</span> What people are testing
          right now
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Row items={ROW_A} />
          <Row items={ROW_B} reverse />
        </div>

        {/* edge fades */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: "clamp(40px,8vw,120px)",
            pointerEvents: "none",
            background:
              "linear-gradient(90deg, var(--paper), color-mix(in srgb, var(--paper) 0%, transparent))",
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            width: "clamp(40px,8vw,120px)",
            pointerEvents: "none",
            background:
              "linear-gradient(270deg, var(--paper), color-mix(in srgb, var(--paper) 0%, transparent))",
            zIndex: 2,
          }}
        />
      </Reveal>
    </section>
  );
}
