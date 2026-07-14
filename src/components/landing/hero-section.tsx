"use client";

import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { WORDS } from "./palette";

/** Glossy star used as the reduced-motion / no-WebGL fallback centerpiece. */
function StarFallback() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/starburst.png"
      alt=""
      style={{
        width: "78%",
        height: "auto",
        display: "block",
        animation: "hl-float 6s ease-in-out infinite",
        filter:
          "brightness(1.16) contrast(1.06) drop-shadow(0 0 44px color-mix(in srgb, var(--s1) 42%, transparent)) drop-shadow(0 34px 60px color-mix(in srgb, var(--s2) 30%, transparent))",
      }}
    />
  );
}

// The WebGL mascot is client-only and lazy — never blocks SSR, and the PNG
// shows while its chunk loads.
const HeroRobot = dynamic(
  () => import("./hero-robot").then((m) => m.HeroRobot),
  { ssr: false, loading: () => <StarFallback /> },
);

// Dark, glossy hero scheme (overrides the page palette locally). Accents
// (--s1/--s2) still inherit from the page palette so the brand colors carry.
const DARK = {
  paper: "#0E0D12",
  ink: "#F2ECDD",
  muted: "#8C8676",
  rule: "rgba(242,236,221,0.16)",
};

type Phase = "enter" | "focus" | "leave";

export type HeroSectionProps = {
  wordHold?: number;
  autoplay?: boolean;
};

export function HeroSection({
  wordHold = 900,
  autoplay = true,
}: HeroSectionProps) {
  const [wi, setWi] = useState(0);
  const [phase, setPhase] = useState<Phase>("enter");
  const [wordShow, setWordShow] = useState(false);
  const [heroIn, setHeroIn] = useState(false);
  const [uiIn, setUiIn] = useState(false);

  const runRef = useRef(0);

  const wait = useCallback(
    (ms: number, run: number) =>
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(run === runRef.current), ms);
      }),
    [],
  );

  const finalState = useCallback(() => {
    setWordShow(false);
    setHeroIn(true);
    setUiIn(true);
  }, []);

  const runIntro = useCallback(
    async (run: number) => {
      if (!(await wait(360, run))) return;
      for (let i = 0; i < WORDS.length; i++) {
        setWi(i);
        setPhase("enter");
        setWordShow(true);
        if (!(await wait(40, run))) return;
        setPhase("focus");
        if (!(await wait(wordHold + 700, run))) return;
        setPhase("leave");
        if (!(await wait(480, run))) return;
        setWordShow(false);
        if (!(await wait(120, run))) return;
      }
      setUiIn(true);
      setHeroIn(true);
    },
    [wait, wordHold],
  );

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (autoplay === false || reduced) {
      const t = setTimeout(finalState, 0);
      return () => clearTimeout(t);
    }
    runRef.current += 1;
    runIntro(runRef.current);
    return () => {
      runRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived word-cycle visuals.
  let wordO = 0;
  let wordBlur = "blur(26px)";
  let wordT = "scale(1.06)";
  let wordTr = "none";
  let wordLine = "0px";
  if (phase === "focus") {
    wordO = 1;
    wordBlur = "blur(0px)";
    wordT = "scale(1)";
    wordTr =
      "filter 920ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease, transform 920ms cubic-bezier(.16,.9,.24,1)";
    wordLine = "clamp(120px,20vw,300px)";
  } else if (phase === "leave") {
    wordO = 0;
    wordBlur = "blur(22px)";
    wordT = "scale(0.95)";
    wordTr = "filter 460ms ease, opacity 460ms ease, transform 460ms ease";
    wordLine = "clamp(120px,20vw,300px)";
  }

  const reduce = useReducedMotion();

  // ---- Hero copy pieces (shared across layouts) ----
  const reveal = (delay: number): React.CSSProperties => ({
    opacity: heroIn ? 1 : 0,
    transform: heroIn ? "translateY(0)" : "translateY(34px)",
    transition:
      "transform 900ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease",
    transitionDelay: `${delay}ms`,
  });

  const mascot = (width: string, extra?: React.CSSProperties) => (
    <div
      style={{
        width,
        aspectRatio: "1 / 1",
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: heroIn ? 1 : 0,
        transform: reduce ? (heroIn ? "scale(1)" : "scale(0.6)") : "none",
        transition:
          "opacity 500ms ease, transform 1200ms cubic-bezier(.18,.9,.24,1)",
        ...extra,
      }}
    >
      {reduce ? (
        <StarFallback />
      ) : (
        <HeroRobot play={heroIn} />
      )}
    </div>
  );

  const eyebrow = (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        marginBottom: "clamp(14px,2vh,22px)",
        fontSize: 11.5,
        letterSpacing: "0.24em",
        textTransform: "uppercase",
        color: "var(--muted)",
        ...reveal(0),
      }}
    >
      <span style={{ color: "var(--s1)" }}>✦</span> Field Log · A test of one
    </div>
  );

  const hStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: "'Clash Display',sans-serif",
    fontWeight: 700,
    fontSize: "clamp(48px,9vw,138px)",
    lineHeight: 0.88,
    letterSpacing: "-0.03em",
    textTransform: "uppercase",
  };
  const line1Style: React.CSSProperties = {
    display: "block",
    opacity: heroIn ? 1 : 0,
    filter: heroIn ? "blur(0px)" : "blur(16px)",
    transform: heroIn ? "translateY(0)" : "translateY(34px)",
    transition:
      "transform 900ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease, filter 900ms ease",
    transitionDelay: "70ms",
  };
  const line2Style: React.CSSProperties = {
    ...line1Style,
    transitionDelay: "150ms",
    backgroundImage: "linear-gradient(92deg, var(--s1), var(--s2))",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
  };
  const line1 = <span style={line1Style}>Got a hunch?</span>;
  const line2 = <span style={line2Style}>Prove it.</span>;
  const headline = (
    <h1 style={hStyle}>
      {line1}
      {line2}
    </h1>
  );

  const paragraph = (centered: boolean) => (
    <p
      style={{
        margin: centered
          ? "clamp(18px,2.6vh,30px) auto 0"
          : "clamp(18px,2.6vh,30px) 0 0",
        maxWidth: "min(52ch,100%)",
        fontSize: "clamp(12.5px,1.05vw,15px)",
        lineHeight: 1.7,
        color: "var(--muted)",
        ...reveal(250),
      }}
    >
      A verdict backed by real data.
    </p>
  );

  const frame: React.CSSProperties = {
    position: "absolute",
    zIndex: 7,
    left: "clamp(30px,3.6vw,52px)",
    right: "clamp(30px,3.6vw,52px)",
    top: "clamp(92px,11vh,132px)",
    bottom: "clamp(96px,13vh,132px)",
  };

  const heroCopy = (
    <div
      style={{
        ...frame,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      {mascot("clamp(220px,30vw,400px)", {
        marginBottom: "clamp(10px,2vh,28px)",
      })}
      {eyebrow}
      {headline}
      {paragraph(true)}
    </div>
  );

  return (
    <section
      style={
        {
          position: "relative",
          minHeight: "100vh",
          overflow: "hidden",
          background: DARK.paper,
          color: DARK.ink,
          "--paper": DARK.paper,
          "--ink": DARK.ink,
          "--muted": DARK.muted,
          "--rule": DARK.rule,
        } as React.CSSProperties
      }
    >
      {/* RADIAL GLOW behind the star */}
      <div
        style={{
          position: "absolute",
          zIndex: 0,
          top: "38%",
          left: "50%",
          width: "min(1100px, 120vw)",
          height: "min(1100px, 120vw)",
          transform: "translate(-50%,-50%)",
          pointerEvents: "none",
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--s1) 26%, transparent) 0%, color-mix(in srgb, var(--s2) 16%, transparent) 34%, transparent 62%)",
          opacity: heroIn ? 1 : 0,
          transition: "opacity 1400ms ease",
        }}
      />

      {/* HEADER */}
      <div
        style={{
          position: "absolute",
          zIndex: 7,
          top: "clamp(30px,3.4vw,46px)",
          left: "clamp(30px,3.6vw,52px)",
          right: "clamp(30px,3.6vw,52px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: uiIn ? 1 : 0,
          transform: uiIn ? "translateY(0)" : "translateY(-18px)",
          transition:
            "transform 720ms cubic-bezier(.2,.8,.2,1), opacity 720ms ease",
          transitionDelay: "60ms",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/starburst.png"
            alt=""
            style={{ width: 22, height: 22, display: "block" }}
          />
          <span
            style={{
              fontFamily: "'Clash Display',sans-serif",
              fontWeight: 600,
              fontSize: 21,
              letterSpacing: "-0.01em",
            }}
          >
            hunch
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "clamp(14px,2vw,30px)",
            fontSize: 11.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          <a href="#how" className="hl-navlink">
            How it works
          </a>
          <a href="#method" className="hl-navlink">
            Method
          </a>
          <Link
            href="/signin"
            className="hl-signin"
            style={{
              padding: "8px 15px",
              border: "1px solid var(--ink)",
              color: "var(--ink)",
            }}
          >
            Sign in
          </Link>
        </div>
      </div>

      {/* HERO COPY — layout-switched (see heroCopy above) */}
      {heroCopy}

      {/* BOTTOM FADE into the light page below */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "clamp(120px,20vh,240px)",
          zIndex: 6,
          pointerEvents: "none",
          background: `linear-gradient(to bottom, transparent, ${DARK.paper})`,
        }}
      />

      {/* INTRO WORD CYCLE (blur → focus) — fixed overlay above everything */}
      {wordShow && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            background: "var(--paper)",
          }}
        >
          <div
            style={{
              opacity: wordO,
              filter: wordBlur,
              transform: wordT,
              transition: wordTr,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "clamp(38px,4.6vw,56px)",
                height: "clamp(38px,4.6vw,56px)",
                margin: "0 auto 22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/starburst.png"
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  animation: "hl-sparkle 2.2s ease-in-out infinite",
                }}
              />
            </div>
            <div
              style={{
                fontFamily: "'Clash Display',sans-serif",
                fontWeight: 600,
                fontSize: "clamp(80px,15vw,210px)",
                lineHeight: 1,
                letterSpacing: "-0.04em",
                color: "var(--ink)",
              }}
            >
              {WORDS[wi] || ""}
              <span
                style={{
                  display: "inline-block",
                  width: "clamp(10px,1.3vw,17px)",
                  height: "clamp(10px,1.3vw,17px)",
                  marginLeft: "0.1em",
                  background: "var(--s1)",
                  verticalAlign: "baseline",
                }}
              />
            </div>
            <div
              style={{
                width: wordLine,
                height: 2,
                margin: "28px auto 0",
                background: "linear-gradient(90deg,var(--s1),var(--s2))",
                transition: "width 700ms cubic-bezier(.16,.9,.24,1)",
              }}
            />
          </div>
        </div>
      )}

    </section>
  );
}
