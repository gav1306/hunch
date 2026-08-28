"use client";

import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthGazeProvider } from "@/components/auth/auth-gaze";
import { GRAIN_SVG } from "@/components/landing/palette";
import { appThemeStyle } from "@/lib/app-theme";

const HeroRobot = dynamic(
  () => import("@/components/landing/hero-robot").then((m) => m.HeroRobot),
  { ssr: false },
);

const ROTATING = [
  "Does coffee wreck my sleep?",
  "Do cold plunges cut my soreness?",
  "Does lo-fi actually help me focus?",
  "Earlier dinner = lighter mornings?",
  "Does saying no free up my week?",
];

function Wordmark() {
  return (
    <Link
      href="/"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        textDecoration: "none",
        color: "var(--ink)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/starburst.png" alt="" width={22} height={22} />
      <span
        style={{
          fontFamily: "'Clash Display',sans-serif",
          fontWeight: 600,
          fontSize: 21,
          letterSpacing: "-0.01em",
        }}
      >
        hun<span style={{ color: "var(--s1)" }}>ch</span>
      </span>
    </Link>
  );
}

function RotatingHunch() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % ROTATING.length), 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 16,
        }}
      >
        Testing right now <span aria-hidden style={{ color: "var(--s1)" }}>✦</span>
      </div>
      <div
        style={{
          minHeight: "clamp(90px,12vh,130px)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          key={i}
          className="auth-rotate"
          style={{
            fontFamily: "'Clash Display',sans-serif",
            fontWeight: 600,
            fontSize: "clamp(24px,2.6vw,38px)",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          “{ROTATING[i]}”
        </div>
      </div>
      <div
        style={{
          width: "clamp(70px,8vw,110px)",
          height: 2,
          marginTop: 18,
          background: "linear-gradient(90deg,var(--s1),var(--s2))",
        }}
      />
    </div>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  // The bot looks away while the password field is focused. The field lives in
  // the form (children); the setter reaches it through AuthGazeProvider.
  const [passwordFocused, setPasswordFocused] = useState(false);
  const gaze = useMemo(() => ({ setPasswordFocused }), [setPasswordFocused]);

  const mascot = (
    <div
      style={{
        width: "clamp(150px,17vw,240px)",
        aspectRatio: "1 / 1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {reduce ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/starburst.png"
          alt=""
          style={{
            width: "70%",
            filter:
              "brightness(1.16) drop-shadow(0 0 40px color-mix(in srgb, var(--s1) 42%, transparent))",
          }}
        />
      ) : (
        <HeroRobot play gaze={passwordFocused ? "away" : "form"} />
      )}
    </div>
  );

  return (
    <AuthGazeProvider value={gaze}>
    <div
      className="auth-shell"
      style={{
        position: "relative",
        overflowX: "hidden",
        ...appThemeStyle(),
      }}
    >
      <style>{`
        .auth-mobilebrand{display:none;}
        .auth-submit:hover:not(:disabled){filter:brightness(0.92);}
        .auth-link:hover{color:var(--s1) !important;}
        .auth-rotate{animation:auth-fade 600ms ease;}
        @keyframes auth-fade{from{opacity:0;filter:blur(10px);transform:translateY(6px)}to{opacity:1;filter:blur(0);transform:none}}
        @media (max-width:820px){
          .auth-brand{display:none !important;}
          .auth-mobilebrand{display:flex !important;}
        }
        @media (prefers-reduced-motion: reduce){ .auth-shell *{animation:none !important;} }
      `}</style>

      {/* page grain */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          pointerEvents: "none",
          opacity: 0.05,
          mixBlendMode: "soft-light",
          backgroundImage: GRAIN_SVG,
        }}
      />

      <div style={{ minHeight: "100vh", display: "flex" }}>
        {/* LEFT — branded panel */}
        <div
          className="auth-brand"
          style={{
            position: "relative",
            flex: "1 1 46%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "clamp(28px,4vw,56px)",
            borderRight: "1px solid var(--rule)",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(70% 60% at 50% 42%, color-mix(in srgb, var(--s1) 22%, transparent) 0%, color-mix(in srgb, var(--s2) 12%, transparent) 40%, transparent 70%)",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <Wordmark />
          </div>
          <div style={{ position: "relative", zIndex: 1, alignSelf: "center" }}>
            {mascot}
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <RotatingHunch />
          </div>
        </div>

        {/* RIGHT — form */}
        <div
          style={{
            position: "relative",
            flex: "1 1 54%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(28px,4vw,56px)",
          }}
        >
          <div style={{ width: "100%", maxWidth: 420 }}>
            <div className="auth-mobilebrand" style={{ marginBottom: 28 }}>
              <Wordmark />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
    </AuthGazeProvider>
  );
}
