"use client";

import Image from "next/image";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useRef, useState } from "react";

const TARGET = 91;

function Card({ belief, shown }: { belief: number; shown: boolean }) {
  const barW = `${belief}%`;

  return (
    <div
      style={{
        position: "relative",
        border: "1px solid var(--rule)",
        padding: "clamp(30px,4vw,60px)",
        background: "color-mix(in srgb, var(--paper) 90%, var(--ink))",
        boxShadow: "0 40px 80px -40px color-mix(in srgb, var(--s2) 40%, transparent)",
        overflow: "hidden",
      }}
    >
      {/* verified star seal */}
      <span
        style={{
          position: "absolute",
          top: "50%",
          right: "clamp(-30px,-2vw,-10px)",
          width: "clamp(150px,22vw,300px)",
          zIndex: 0,
          pointerEvents: "none",
          opacity: shown ? 0.5 : 0,
          transform: shown
            ? "translateY(-50%) scale(1)"
            : "translateY(-50%) scale(0.4)",
          transition:
            "opacity 800ms ease 720ms, transform 900ms cubic-bezier(.2,1.3,.3,1) 720ms",
        }}
      >
        <Image
          src="/starburst.png"
          alt=""
          aria-hidden
          width={400}
          height={400}
          sizes="(max-width: 900px) 50vw, 400px"
          className="block h-auto w-full mix-blend-luminosity"
          style={{
            animation: "hl-spin 26s linear infinite",
          }}
        />
      </span>

      {/* corner marks */}
      {(
        [
          { top: -1, left: -1 },
          { top: -1, right: -1 },
          { bottom: -1, left: -1 },
          { bottom: -1, right: -1 },
        ] as React.CSSProperties[]
      ).map((pos, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            width: 7,
            height: 7,
            borderTop: pos.top !== undefined ? "1px solid var(--s1)" : "none",
            borderBottom:
              pos.bottom !== undefined ? "1px solid var(--s1)" : "none",
            borderLeft: pos.left !== undefined ? "1px solid var(--s1)" : "none",
            borderRight:
              pos.right !== undefined ? "1px solid var(--s1)" : "none",
            zIndex: 2,
            ...pos,
          }}
        />
      ))}

      {/* header */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: "clamp(24px,4vh,40px)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          The reveal · Experiment #18
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
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
          Verdict in
        </div>
      </div>

      {/* verdict word */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: "clamp(12px,2vw,24px)",
          marginBottom: "clamp(28px,4vh,44px)",
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--muted)",
            maxWidth: 160,
            lineHeight: 1.6,
          }}
        >
          Phone in another room → deep work
        </div>
        <div
          style={{
            fontFamily: "'Clash Display',sans-serif",
            fontWeight: 700,
            fontSize: "clamp(56px,10vw,132px)",
            lineHeight: 0.9,
            letterSpacing: "-0.04em",
            color: "var(--s1)",
            transformOrigin: "left center",
            opacity: shown ? 1 : 0,
            transform: shown
              ? "scale(1) rotate(-2deg)"
              : "scale(0.82) rotate(-8deg)",
            transition:
              "opacity 500ms ease 560ms, transform 700ms cubic-bezier(.2,1.4,.3,1) 560ms",
          }}
        >
          HELPED
          <span style={{ color: "var(--s2)" }}>.</span>
        </div>
      </div>

      {/* meter */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          borderTop: "1px solid var(--rule)",
          paddingTop: 18,
          display: "flex",
          alignItems: "center",
          gap: "clamp(18px,3vw,40px)",
          flexWrap: "wrap",
        }}
      >
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
              fontSize: "clamp(46px,6vw,80px)",
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
              fontSize: "clamp(20px,2.4vw,32px)",
              color: "var(--muted)",
            }}
          >
            %
          </span>
        </div>

        <div style={{ flex: "1 1 auto", minWidth: 160 }}>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--ink)",
              marginBottom: 10,
            }}
          >
            Likelihood it&apos;s real
          </div>
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
                background: "linear-gradient(90deg,var(--s1),var(--s2))",
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
          </div>
        </div>

        <div
          style={{
            flex: "0 0 auto",
            textAlign: "right",
            fontSize: 10.5,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            lineHeight: 1.9,
          }}
        >
          <div>
            Difference <span style={{ color: "var(--s2)" }}>+31 min focus</span>
          </div>
          <div>
            <span style={{ color: "var(--s2)" }}>95% sure</span> · 18 days
          </div>
        </div>
      </div>

      {/* caption */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          marginTop: "clamp(22px,3vh,30px)",
          fontSize: 11.5,
          letterSpacing: "0.04em",
          color: "var(--muted)",
        }}
      >
        No opinion. Nothing to argue with —{" "}
        <span style={{ color: "var(--ink)" }}>
          just 18 days of your own data.
        </span>
      </div>

      {/* tail */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          marginTop: "clamp(18px,2.4vh,26px)",
          paddingTop: "clamp(16px,2vh,22px)",
          borderTop: "1px solid var(--rule)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink)",
          opacity: shown ? 1 : 0,
          transform: shown ? "translateY(0)" : "translateY(10px)",
          transition:
            "opacity 600ms ease 1000ms, transform 700ms cubic-bezier(.16,.9,.24,1) 1000ms",
        }}
      >
        <span aria-hidden style={{ color: "var(--s1)" }}>✦</span> Verified · One hunch down,
        the next one’s waiting
      </div>
    </div>
  );
}

export function VerdictReveal() {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? true : false);
  const [belief, setBelief] = useState(reduce ? TARGET : 0);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    rafRef.current = null;
    timeoutRef.current = null;
  }, []);

  const replay = useCallback(() => {
    if (reduce) return;
    cancel();
    setShown(true);
    setBelief(0);
    const dur = 1500;
    let t0 = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setBelief(Math.round(e * TARGET));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    // lead-in: card materializes first, then the number climbs
    timeoutRef.current = setTimeout(() => {
      t0 = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    }, 560);
  }, [reduce, cancel]);

  const reset = useCallback(() => {
    if (reduce) return;
    cancel();
    setShown(false);
    setBelief(0);
  }, [reduce, cancel]);

  const inner = (
    <section
      id="verdict"
      style={{
        position: "relative",
        padding: "clamp(56px,11vh,120px) clamp(30px,3.6vw,52px)",
        maxWidth: 1000,
        margin: "0 auto",
        backgroundImage:
          "radial-gradient(60% 50% at 50% 50%, color-mix(in srgb, var(--s2) 12%, transparent) 0%, color-mix(in srgb, var(--s1) 7%, transparent) 45%, transparent 74%)",
      }}
    >
      <h2 className="sr-only">What a verdict looks like</h2>
      <Card belief={belief} shown={shown} />
    </section>
  );

  if (reduce) return inner;

  return (
    <motion.div
      initial={{ opacity: 0, y: 80, scale: 0.94, filter: "blur(16px)" }}
      whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: 1.3, ease: [0.16, 0.9, 0.24, 1] }}
      onViewportEnter={replay}
      onViewportLeave={reset}
    >
      {inner}
    </motion.div>
  );
}
