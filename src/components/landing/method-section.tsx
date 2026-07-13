"use client";

import { useReveal } from "./use-reveal";

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
  const { ref, shown } = useReveal<HTMLDivElement>();

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
      <div ref={ref}>
        <div
          style={{
            fontSize: 11.5,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: "clamp(22px,3vh,34px)",
            opacity: shown ? 1 : 0,
            transform: shown ? "translateY(0)" : "translateY(20px)",
            transition:
              "transform 720ms cubic-bezier(.16,.9,.24,1), opacity 600ms ease",
          }}
        >
          <span style={{ color: "var(--s1)" }}>✦</span> The method
        </div>

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
          <span
            style={{
              display: "block",
              opacity: shown ? 1 : 0,
              filter: shown ? "blur(0px)" : "blur(14px)",
              transform: shown ? "translateY(0)" : "translateY(26px)",
              transition:
                "transform 900ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease, filter 900ms ease",
              transitionDelay: "80ms",
            }}
          >
            AI does the talking.
          </span>
          <span
            style={{
              display: "block",
              color: "var(--s1)",
              opacity: shown ? 1 : 0,
              filter: shown ? "blur(0px)" : "blur(14px)",
              transform: shown ? "translateY(0)" : "translateY(26px)",
              transition:
                "transform 900ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease, filter 900ms ease",
              transitionDelay: "200ms",
            }}
          >
            The math does the judging<span style={{ color: "var(--s2)" }}>.</span>
          </span>
        </h2>

        {/* confidence ladder */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "clamp(10px,2vw,22px)",
            marginTop: "clamp(36px,5vh,60px)",
            paddingTop: "clamp(26px,3.4vh,40px)",
            borderTop: "1px solid var(--rule)",
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
                  opacity: shown ? 1 : 0,
                  transform: shown ? "translateY(0)" : "translateY(16px)",
                  transition:
                    "transform 640ms cubic-bezier(.16,.9,.24,1), opacity 520ms ease",
                  transitionDelay: `${360 + i * 160}ms`,
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
                    opacity: shown ? 0.6 : 0,
                    transition: "opacity 520ms ease",
                    transitionDelay: `${440 + i * 160}ms`,
                  }}
                >
                  →
                </span>
              )}
            </div>
          ))}
        </div>

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
            <div
              key={t.k}
              style={{
                borderTop: "1px solid var(--rule)",
                paddingTop: 16,
                opacity: shown ? 1 : 0,
                transform: shown ? "translateY(0)" : "translateY(22px)",
                transition:
                  "transform 760ms cubic-bezier(.16,.9,.24,1), opacity 640ms ease",
                transitionDelay: `${520 + i * 120}ms`,
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
