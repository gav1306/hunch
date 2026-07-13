"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { WORDS, type Palette } from "./palette";

type Phase = "enter" | "focus" | "leave";

export type HeroSectionProps = {
  palette: Palette;
  showMeter?: boolean;
  beliefTarget?: number;
  wordHold?: number;
  autoplay?: boolean;
  startHref?: string;
};

export function HeroSection({
  palette: P,
  showMeter = true,
  beliefTarget = 82,
  wordHold = 900,
  autoplay = true,
  startHref = "/hunch/new",
}: HeroSectionProps) {
  const [wi, setWi] = useState(0);
  const [phase, setPhase] = useState<Phase>("enter");
  const [wordShow, setWordShow] = useState(false);
  const [heroIn, setHeroIn] = useState(false);
  const [uiIn, setUiIn] = useState(false);
  const [meterIn, setMeterIn] = useState(false);
  const [belief, setBelief] = useState(0);

  const runRef = useRef(0);
  const rafRef = useRef<number | null>(null);

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
    setMeterIn(true);
    setBelief(beliefTarget);
  }, [beliefTarget]);

  const countBelief = useCallback(
    (run: number) => {
      const dur = 1500;
      const t0 = performance.now();
      const tick = (now: number) => {
        if (run !== runRef.current) return;
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        setBelief(Math.round(e * beliefTarget));
        if (p < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [beliefTarget],
  );

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
      if (!(await wait(360, run))) return;
      setMeterIn(true);
      if (!(await wait(260, run))) return;
      countBelief(run);
    },
    [wait, wordHold, countBelief],
  );

  const replay = useCallback(() => {
    runRef.current += 1;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setWi(0);
    setPhase("enter");
    setWordShow(false);
    setHeroIn(false);
    setUiIn(false);
    setMeterIn(false);
    setBelief(0);
    runIntro(runRef.current);
  }, [runIntro]);

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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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

  const barW = `${belief}%`;
  const ornBlend = P.dark ? "screen" : "luminosity";

  return (
    <section
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
      }}
    >
      {/* LARGE ORNAMENT STARBURST */}
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          top: "-6%",
          right: "-4%",
          width: "clamp(220px,26vw,340px)",
          pointerEvents: "none",
          opacity: heroIn ? 1 : 0,
          transform: heroIn
            ? "translate(0,0) rotate(0deg)"
            : "translate(30px,-20px) rotate(-20deg)",
          transition:
            "opacity 1100ms ease, transform 1300ms cubic-bezier(.18,.9,.24,1)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/starburst.png"
          alt=""
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            opacity: 0.5,
            mixBlendMode: ornBlend as React.CSSProperties["mixBlendMode"],
            animation: "hl-wobble 15s ease-in-out infinite",
          }}
        />
      </div>

      {/* PAGE FRAME */}
      <div
        style={{
          position: "absolute",
          inset: "clamp(14px,1.6vw,26px)",
          zIndex: 5,
          border: "1px solid var(--rule)",
          pointerEvents: "none",
          opacity: uiIn ? 1 : 0,
          transition: "opacity 720ms ease",
        }}
      />
      {(
        [
          { top: "clamp(9px,1.6vw,21px)", left: "clamp(9px,1.6vw,21px)" },
          { top: "clamp(9px,1.6vw,21px)", right: "clamp(9px,1.6vw,21px)" },
          { bottom: "clamp(9px,1.6vw,21px)", left: "clamp(9px,1.6vw,21px)" },
          { bottom: "clamp(9px,1.6vw,21px)", right: "clamp(9px,1.6vw,21px)" },
        ] as React.CSSProperties[]
      ).map((pos, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            zIndex: 6,
            pointerEvents: "none",
            color: "var(--muted)",
            fontSize: 14,
            lineHeight: 1,
            opacity: uiIn ? 1 : 0,
            transition: "opacity 720ms ease",
            ...pos,
          }}
        >
          +
        </div>
      ))}

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
            href="/hunch/new"
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

      {/* HERO COPY */}
      <div
        style={{
          position: "absolute",
          zIndex: 7,
          left: "clamp(30px,3.6vw,52px)",
          right: "clamp(30px,3.6vw,52px)",
          top: "clamp(92px,11vh,144px)",
          bottom: "clamp(132px,19vh,172px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: "clamp(16px,2.4vh,28px)",
            fontSize: 11.5,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--muted)",
            opacity: heroIn ? 1 : 0,
            transform: heroIn ? "translateY(0)" : "translateY(34px)",
            transition:
              "transform 820ms cubic-bezier(.16,.9,.24,1), opacity 640ms ease",
          }}
        >
          <span style={{ color: "var(--s1)" }}>✦</span> Field Log · A test of
          one
        </div>

        <h1
          style={{
            margin: 0,
            fontFamily: "'Clash Display',sans-serif",
            fontWeight: 600,
            fontSize: "clamp(46px,8.4vw,124px)",
            lineHeight: 0.9,
            letterSpacing: "-0.04em",
          }}
        >
          <span
            style={{
              display: "block",
              opacity: heroIn ? 1 : 0,
              filter: heroIn ? "blur(0px)" : "blur(16px)",
              transform: heroIn ? "translateY(0)" : "translateY(34px)",
              transition:
                "transform 900ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease, filter 900ms ease",
              transitionDelay: "70ms",
            }}
          >
            Got a hunch?
          </span>
          <span
            style={{
              display: "block",
              color: "var(--s1)",
              opacity: heroIn ? 1 : 0,
              filter: heroIn ? "blur(0px)" : "blur(16px)",
              transform: heroIn ? "translateY(0)" : "translateY(34px)",
              transition:
                "transform 900ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease, filter 900ms ease",
              transitionDelay: "150ms",
            }}
          >
            Prove it<span style={{ color: "var(--s2)" }}>.</span>
          </span>
        </h1>

        <p
          style={{
            margin: "clamp(18px,2.6vh,30px) 0 0",
            maxWidth: "min(52ch,90%)",
            fontSize: "clamp(12.5px,1.05vw,15px)",
            lineHeight: 1.7,
            color: "var(--muted)",
            opacity: heroIn ? 1 : 0,
            transform: heroIn ? "translateY(0)" : "translateY(34px)",
            transition:
              "transform 900ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease",
            transitionDelay: "250ms",
          }}
        >
          Turn a random hunch — about your habits, your focus, your body,
          anything — into a real experiment. A verdict backed by real data.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "clamp(16px,2vw,26px)",
            flexWrap: "wrap",
            marginTop: "clamp(22px,3.2vh,38px)",
            opacity: heroIn ? 1 : 0,
            transform: heroIn ? "translateY(0)" : "translateY(34px)",
            transition:
              "transform 900ms cubic-bezier(.16,.9,.24,1), opacity 700ms ease",
            transitionDelay: "340ms",
          }}
        >
          <Link
            href={startHref}
            className="hl-cta"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "15px 24px",
              border: "none",
              cursor: "pointer",
              fontFamily: "'Space Mono',monospace",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--paper)",
              background: "var(--ink)",
            }}
          >
            Start free{" "}
            <span
              style={{
                display: "inline-block",
                animation: "hl-arrow 1.8s ease-in-out infinite",
              }}
            >
              →
            </span>
          </Link>
        </div>

        <div
          style={{
            marginTop: "clamp(18px,2.6vh,26px)",
            fontSize: 11,
            letterSpacing: "0.06em",
            color: "var(--muted)",
            opacity: heroIn ? 1 : 0,
            transition: "opacity 700ms ease",
            transitionDelay: "460ms",
          }}
        >
          A simple plan you actually stick to —{" "}
          <span style={{ color: "var(--ink)" }}>then a verdict you can trust.</span>
        </div>
      </div>

      {/* BELIEF INSTRUMENT (bottom gauge) */}
      {showMeter && (
        <div
          style={{
            position: "absolute",
            zIndex: 7,
            left: "clamp(30px,3.6vw,52px)",
            right: "clamp(30px,3.6vw,52px)",
            bottom: "clamp(46px,6vh,64px)",
            opacity: meterIn ? 1 : 0,
            transform: meterIn ? "translateY(0)" : "translateY(26px)",
            transition:
              "transform 900ms cubic-bezier(.18,.9,.24,1), opacity 780ms ease",
          }}
        >
          <div
            style={{
              borderTop: "1px solid var(--rule)",
              paddingTop: 14,
              display: "flex",
              alignItems: "center",
              gap: "clamp(18px,3vw,40px)",
            }}
          >
            <div style={{ flex: "0 0 auto" }}>
              <div
                style={{
                  fontSize: 10.5,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--ink)",
                  marginBottom: 6,
                }}
              >
                Likelihood it&apos;s real
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                }}
              >
                screens off → sleep{" "}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    color: "var(--s1)",
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "var(--s1)",
                      animation: "hl-live 1.6s steps(1,end) infinite",
                    }}
                  />
                  Live
                </span>
              </div>
            </div>

            <div
              style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "baseline",
                gap: 2,
                lineHeight: 0.8,
              }}
            >
              <span
                style={{
                  fontFamily: "'Clash Display',sans-serif",
                  fontWeight: 600,
                  fontSize: "clamp(42px,5.4vw,74px)",
                  letterSpacing: "-0.03em",
                  color: "var(--s1)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {belief}
              </span>
              <span
                style={{
                  fontFamily: "'Clash Display',sans-serif",
                  fontWeight: 600,
                  fontSize: "clamp(18px,2.4vw,30px)",
                  color: "var(--muted)",
                }}
              >
                %
              </span>
            </div>

            <div style={{ flex: "1 1 auto", minWidth: 120 }}>
              <div style={{ position: "relative", height: 24 }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    height: 2,
                    background: "var(--rule)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: 2,
                    width: barW,
                    background: "var(--s1)",
                  }}
                />
                {["0%", "25%", "50%", "75%", "100%"].map((l, i) => (
                  <div
                    key={l}
                    style={{
                      position: "absolute",
                      left: l,
                      top: 0,
                      width: 1,
                      height: 8,
                      background: "var(--rule)",
                      transform: i === 4 ? "translateX(-1px)" : undefined,
                    }}
                  />
                ))}
                <div
                  style={{
                    position: "absolute",
                    left: barW,
                    top: -5,
                    width: 2,
                    height: 18,
                    background: "var(--s1)",
                    transform: "translateX(-50%)",
                    animation: "hl-needle 2.6s ease-in-out infinite",
                    boxShadow:
                      "0 0 0 3px color-mix(in srgb, var(--s1) 18%, transparent)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "0%",
                    top: 12,
                    fontSize: 9.5,
                    color: "var(--muted)",
                  }}
                >
                  0
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: 12,
                    fontSize: 9.5,
                    color: "var(--muted)",
                    transform: "translateX(-50%)",
                  }}
                >
                  50
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: "100%",
                    top: 12,
                    fontSize: 9.5,
                    color: "var(--muted)",
                    transform: "translateX(-100%)",
                  }}
                >
                  100
                </div>
              </div>
            </div>

            <div
              style={{
                flex: "0 0 auto",
                textAlign: "right",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--muted)",
                lineHeight: 1.7,
              }}
            >
              <div>
                So far <span style={{ color: "var(--s2)" }}>+38 min</span> ·{" "}
                <span style={{ color: "var(--s2)" }}>likely real</span>
              </div>
              <div>14 check-ins · Day 14 / 21</div>
            </div>
          </div>
        </div>
      )}

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

      {/* scroll cue */}
      <a
        href="#how"
        className="hl-replay"
        style={{
          position: "absolute",
          zIndex: 7,
          bottom: "clamp(16px,2vw,22px)",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--muted)",
          cursor: "pointer",
          opacity: uiIn ? 1 : 0,
          transition: "color 200ms ease, opacity 720ms ease",
          transitionDelay: "300ms",
        }}
      >
        Scroll{" "}
        <span
          style={{
            display: "inline-block",
            animation: "hl-bob 1.8s ease-in-out infinite",
          }}
        >
          ↓
        </span>
      </a>

      {/* replay */}
      <div
        className="hl-replay"
        onClick={replay}
        style={{
          position: "absolute",
          zIndex: 7,
          bottom: "clamp(16px,2vw,22px)",
          right: "clamp(30px,3.6vw,52px)",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--muted)",
          cursor: "pointer",
          opacity: uiIn ? 1 : 0,
          transition: "color 200ms ease, opacity 720ms ease",
          transitionDelay: "300ms",
        }}
      >
        ↺ Replay
      </div>
    </section>
  );
}
