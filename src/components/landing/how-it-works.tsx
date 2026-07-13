"use client";

import type { CSSProperties, ReactNode } from "react";
import { useReveal } from "./use-reveal";

type Step = {
  tag: string;
  no: string;
  title: string;
  body: string;
  glyph: ReactNode;
};

function SparkleGlyph() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/starburst.png"
      alt=""
      style={{
        width: 34,
        height: 34,
        display: "block",
        animation: "hl-sparkle 2.6s ease-in-out infinite",
      }}
    />
  );
}

function TapGlyph() {
  return (
    <div style={{ position: "relative", width: 34, height: 34 }}>
      <span
        style={{
          position: "absolute",
          inset: 0,
          margin: "auto",
          width: 12,
          height: 12,
          borderRadius: "50%",
          border: "2px solid var(--s1)",
          animation: "hl-echo 2.2s ease-out infinite",
        }}
      />
      <span
        style={{
          position: "absolute",
          inset: 0,
          margin: "auto",
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "var(--s1)",
        }}
      />
    </div>
  );
}

function GaugeGlyph() {
  return (
    <div style={{ position: "relative", width: 40, height: 34 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 8,
          height: 2,
          background: "var(--rule)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 8,
          height: 2,
          width: "72%",
          background: "var(--s1)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "72%",
          bottom: 4,
          width: 2,
          height: 14,
          background: "var(--s1)",
          transform: "translateX(-50%)",
          animation: "hl-needle 2.6s ease-in-out infinite",
        }}
      />
    </div>
  );
}

const STEPS: Step[] = [
  {
    tag: "Guess",
    no: "01",
    title: "Drop a hunch",
    body: "“I focus better with my phone in another room.” Say it in plain words. The AI coach sharpens it into one question worth testing — specific, fair, yours.",
    glyph: <SparkleGlyph />,
  },
  {
    tag: "Test",
    no: "02",
    title: "One tap a day",
    body: "Follow a simple plan. On, off, on again. Tap once a day to note how it went — no spreadsheets, no willpower olympics.",
    glyph: <TapGlyph />,
  },
  {
    tag: "Know",
    no: "03",
    title: "Get a verdict",
    body: "Helped, hurt, or no difference — decided by the numbers in your own log, not a gut call. An answer you can actually stand behind.",
    glyph: <GaugeGlyph />,
  },
];

export function HowItWorks() {
  const { ref, shown } = useReveal<HTMLDivElement>();

  return (
    <section
      id="how"
      style={{
        position: "relative",
        padding: "clamp(72px,12vh,140px) clamp(30px,3.6vw,52px)",
        maxWidth: 1240,
        margin: "0 auto",
      }}
    >
      <div ref={ref}>
        {/* eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 11.5,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: "clamp(28px,4vh,48px)",
            opacity: shown ? 1 : 0,
            transform: shown ? "translateY(0)" : "translateY(24px)",
            transition:
              "transform 760ms cubic-bezier(.16,.9,.24,1), opacity 640ms ease",
          }}
        >
          <span style={{ color: "var(--s1)" }}>✦</span> How it works
        </div>

        {/* cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "clamp(1px,0.12vw,1px)",
            background: "var(--rule)",
            border: "1px solid var(--rule)",
          }}
        >
          {STEPS.map((s, i) => (
            <div
              key={s.no}
              style={
                {
                  position: "relative",
                  background: "var(--paper)",
                  padding: "clamp(26px,2.4vw,38px)",
                  minHeight: "clamp(240px,26vh,300px)",
                  display: "flex",
                  flexDirection: "column",
                  opacity: shown ? 1 : 0,
                  transform: shown ? "translateY(0)" : "translateY(32px)",
                  transition:
                    "transform 820ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease",
                  transitionDelay: `${140 + i * 130}ms`,
                } as CSSProperties
              }
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "clamp(26px,4vh,44px)",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "var(--s1)",
                  }}
                >
                  {s.tag}
                </span>
                <span
                  style={{
                    fontFamily: "'Clash Display',sans-serif",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "var(--muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {s.no}
                </span>
              </div>

              <div style={{ marginBottom: "clamp(16px,2vh,22px)" }}>
                {s.glyph}
              </div>

              <h3
                style={{
                  margin: "0 0 12px",
                  fontFamily: "'Clash Display',sans-serif",
                  fontWeight: 600,
                  fontSize: "clamp(24px,2.4vw,32px)",
                  letterSpacing: "-0.02em",
                  color: "var(--ink)",
                }}
              >
                {s.title}
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "clamp(12.5px,1vw,14px)",
                  lineHeight: 1.7,
                  color: "var(--muted)",
                }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
