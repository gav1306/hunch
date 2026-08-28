"use client";

import { Reveal } from "./motion-primitives";

const LADDER = [
  { word: "guess", sym: "≈", val: "08", live: false },
  { word: "test", sym: "≈", val: "41", live: false },
  { word: "know", sym: "=", val: "82", live: true },
];

const TRUST = [
  { k: "Real math, not vibes", v: "The verdict comes straight from the numbers in your log — the careful way a proper study would call it." },
  { k: "Only your data", v: "It’s about you, not some average stranger. Private by default." },
  { k: "A straight answer", v: "You get a clear yes, no, or maybe — plus how sure we are. Not a motivational nudge." },
];

export function MethodSection() {
  return (
    <section
      id="method"
      style={{
        position: "relative",
        padding: "clamp(72px,12vh,140px) clamp(30px,3.6vw,52px)",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <Reveal
        y={20}
        duration={0.7}
        style={{
          fontSize: 11.5,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: "clamp(22px,3vh,34px)",
        }}
      >
        <span aria-hidden style={{ color: "var(--s1)" }}>✦</span> The method
      </Reveal>

      {/* statement */}
      <h2
        style={{
          margin: 0,
          fontFamily: "'Clash Display',sans-serif",
          fontWeight: 600,
          fontSize: "clamp(34px,5.4vw,76px)",
          lineHeight: 1.02,
          letterSpacing: "-0.03em",
          color: "var(--ink)",
          maxWidth: "16ch",
        }}
      >
        <Reveal as="span" y={26} delay={0.05} style={{ display: "block" }}>
          AI does the talking.
        </Reveal>
        <Reveal
          as="span"
          y={26}
          delay={0.15}
          style={{ display: "block", color: "var(--s1)" }}
        >
          The math does the judging<span style={{ color: "var(--s2)" }}>.</span>
        </Reveal>
      </h2>

      {/* confidence ladder */}
      <Reveal
        y={30}
        delay={0.1}
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "clamp(10px,2vw,22px)",
          marginTop: "clamp(36px,5vh,60px)",
          paddingTop: "clamp(26px,3.4vh,40px)",
          borderTop: "1px solid transparent",
          borderImage: "linear-gradient(90deg,var(--s1),var(--s2)) 1",
        }}
      >
        {LADDER.map((step, i) => (
          <div
            key={step.word}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "clamp(10px,2vw,22px)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontFamily: "'Clash Display',sans-serif",
                  fontWeight: 600,
                  fontSize: "clamp(20px,2.6vw,34px)",
                  letterSpacing: "-0.02em",
                  color: step.live ? "var(--ink)" : "var(--muted)",
                }}
              >
                {step.word}
              </span>
              <span
                style={{
                  fontSize: "clamp(14px,1.6vw,20px)",
                  color: step.live ? "var(--s1)" : "var(--muted)",
                }}
              >
                {step.sym}
              </span>
              <span
                style={{
                  fontFamily: "'Clash Display',sans-serif",
                  fontWeight: 600,
                  fontSize: "clamp(20px,2.6vw,34px)",
                  letterSpacing: "-0.02em",
                  color: step.live ? "var(--s1)" : "var(--muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {step.val}
                <span style={{ fontSize: "0.6em", color: "var(--muted)" }}>
                  %
                </span>
              </span>
            </div>
            {i < LADDER.length - 1 && (
              <span
                style={{
                  color: "var(--muted)",
                  fontSize: "clamp(14px,1.6vw,20px)",
                  opacity: 0.6,
                }}
              >
                →
              </span>
            )}
          </div>
        ))}
      </Reveal>

      {/* trust columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "clamp(24px,3vw,48px)",
          marginTop: "clamp(44px,6vh,72px)",
        }}
      >
        {TRUST.map((t, i) => (
          <Reveal
            key={t.k}
            y={22}
            delay={0.1 + i * 0.12}
            style={{
              backgroundColor: "color-mix(in srgb, var(--paper) 90%, var(--ink))",
              backgroundImage:
                "radial-gradient(80% 70% at 50% 0%, color-mix(in srgb, var(--s1) 12%, transparent) 0%, color-mix(in srgb, var(--s2) 7%, transparent) 45%, transparent 78%)",
              borderTop: "2px solid transparent",
              borderImage: "linear-gradient(90deg,var(--s1),var(--s2)) 1",
              padding: "clamp(20px,2.2vw,30px)",
            }}
          >
            <div
              style={{
                fontFamily: "'Clash Display',sans-serif",
                fontWeight: 600,
                fontSize: "clamp(17px,1.8vw,22px)",
                letterSpacing: "-0.01em",
                color: "var(--ink)",
                marginBottom: 8,
              }}
            >
              {t.k}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "clamp(12px,1vw,13.5px)",
                lineHeight: 1.7,
                color: "var(--muted)",
              }}
            >
              {t.v}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
