"use client";

import Link from "next/link";
import { useReveal } from "./use-reveal";

export function FinalCta({ startHref = "/hunch/new" }: { startHref?: string }) {
  const { ref, shown } = useReveal<HTMLDivElement>({ threshold: 0.3 });

  return (
    <section id="start" style={{ position: "relative" }}>
      <div
        ref={ref}
        style={{
          position: "relative",
          margin: "clamp(30px,5vh,72px) clamp(16px,1.6vw,26px)",
          padding: "clamp(56px,12vh,140px) clamp(30px,5vw,80px)",
          background: "var(--ink)",
          color: "var(--paper)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {/* faint ornament */}
        <div
          style={{
            position: "absolute",
            top: "-20%",
            right: "-8%",
            width: "clamp(200px,24vw,320px)",
            pointerEvents: "none",
            opacity: 0.14,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/starburst.png"
            alt=""
            style={{
              width: "100%",
              display: "block",
              animation: "hl-wobble 18s ease-in-out infinite",
            }}
          />
        </div>

        <div
          style={{
            fontSize: 11.5,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--paper)",
            opacity: shown ? 0.6 : 0,
            transform: shown ? "translateY(0)" : "translateY(18px)",
            transition:
              "transform 720ms cubic-bezier(.16,.9,.24,1), opacity 600ms ease",
            marginBottom: "clamp(20px,3vh,30px)",
          }}
        >
          Guess. Test. Know.
        </div>

        <h2
          style={{
            margin: 0,
            fontFamily: "'Clash Display',sans-serif",
            fontWeight: 600,
            fontSize: "clamp(44px,9vw,116px)",
            lineHeight: 0.94,
            letterSpacing: "-0.04em",
            opacity: shown ? 1 : 0,
            filter: shown ? "blur(0px)" : "blur(16px)",
            transform: shown ? "translateY(0)" : "translateY(28px)",
            transition:
              "transform 900ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease, filter 900ms ease",
            transitionDelay: "80ms",
          }}
        >
          Stop guessing.
          <br />
          <span style={{ color: "var(--s1)" }}>
            Start knowing<span style={{ color: "var(--s2)" }}>.</span>
          </span>
        </h2>

        <div
          style={{
            marginTop: "clamp(30px,4vh,46px)",
            opacity: shown ? 1 : 0,
            transform: shown ? "translateY(0)" : "translateY(22px)",
            transition:
              "transform 860ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease",
            transitionDelay: "240ms",
          }}
        >
          <Link
            href={startHref}
            className="hl-cta-inv"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "17px 30px",
              fontFamily: "'Space Mono',monospace",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--ink)",
              background: "var(--paper)",
            }}
          >
            Start your first test{" "}
            <span
              style={{
                display: "inline-block",
                animation: "hl-arrow 1.8s ease-in-out infinite",
              }}
            >
              →
            </span>
          </Link>
          <div
            style={{
              marginTop: 16,
              fontSize: 11,
              letterSpacing: "0.06em",
              color: "var(--paper)",
              opacity: 0.55,
            }}
          >
            No credit card · Cancel your hunch anytime
          </div>
        </div>
      </div>

      {/* footer */}
      <footer
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding:
            "clamp(24px,3vh,36px) clamp(30px,3.6vw,52px) clamp(40px,6vh,64px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          borderTop: "1px solid var(--rule)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/starburst.png"
            alt=""
            style={{ width: 18, height: 18, display: "block" }}
          />
          <span
            style={{
              fontFamily: "'Clash Display',sans-serif",
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: "-0.01em",
              textTransform: "none",
              color: "var(--ink)",
            }}
          >
            hunch
          </span>
        </div>
        <div style={{ display: "flex", gap: "clamp(14px,2vw,28px)" }}>
          <a href="#how" className="hl-navlink">
            How it works
          </a>
          <a href="#method" className="hl-navlink">
            Method
          </a>
          <a href="#verdict" className="hl-navlink">
            The reveal
          </a>
        </div>
        <div>© hunch · AI talks, the math decides</div>
      </footer>
    </section>
  );
}
