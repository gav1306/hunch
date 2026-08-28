"use client";

import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuthGazeProvider } from "@/components/auth/auth-gaze";

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
    <Link href="/" className="inline-flex items-center gap-2 text-ink no-underline">
      <Image src="/starburst.png" alt="" aria-hidden width={22} height={22} />
      <span className="font-heading text-xl font-semibold tracking-[-0.01em]">
        hun<span className="text-s1">ch</span>
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
      <p className="mt-0 mb-4 text-xs tracking-[0.24em] text-muted-foreground uppercase">
        Testing right now{" "}
        <span aria-hidden className="text-s1">
          ✦
        </span>
      </p>
      <div className="flex min-h-[clamp(64px,12vh,130px)] items-center">
        <p
          key={i}
          className="auth-rotate m-0 font-heading text-[clamp(20px,2.6vw,38px)] leading-[1.05] font-semibold tracking-[-0.02em]"
        >
          “{ROTATING[i]}”
        </p>
      </div>
      <div className="mt-[18px] h-0.5 w-[clamp(70px,8vw,110px)] bg-linear-to-r from-s1 to-s2" />
    </div>
  );
}

/**
 * The two-column auth frame: brand on the left, form on the right.
 *
 * Below 820px the brand column used to be `display: none` and a bare wordmark
 * took its place — so the mobile sign-up, which is most sign-ups, was a form on
 * a black page with no evidence of what it was for. It stacks now: wordmark,
 * one rotating hunch, then the form. The mascot is the one part that stays
 * desktop-only; it is a three.js scene and a 240px square, and neither belongs
 * above the fold on a phone.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  // The bot looks away while the password field is focused. The field lives in
  // the form (children); the setter reaches it through AuthGazeProvider.
  const [passwordFocused, setPasswordFocused] = useState(false);
  const gaze = useMemo(() => ({ setPasswordFocused }), [setPasswordFocused]);

  return (
    <AuthGazeProvider value={gaze}>
      <div className="auth-shell relative overflow-x-hidden bg-paper font-mono text-ink">
        <style>{`
          .auth-submit:hover:not(:disabled){filter:brightness(0.92);}
          .auth-link:hover{color:var(--s1) !important;}
          .auth-rotate{animation:auth-fade 600ms ease;}
          @keyframes auth-fade{from{opacity:0;filter:blur(10px);transform:translateY(6px)}to{opacity:1;filter:blur(0);transform:none}}
          @media (prefers-reduced-motion: reduce){ .auth-shell *{animation:none !important;} }
        `}</style>

        <div aria-hidden className="grain-overlay" />

        <div className="flex min-h-dvh flex-col min-[821px]:flex-row">
          {/* Brand */}
          <div className="relative flex flex-col justify-between gap-8 overflow-hidden border-b border-rule p-[clamp(24px,4vw,56px)] min-[821px]:flex-[1_1_46%] min-[821px]:border-r min-[821px]:border-b-0">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(70%_60%_at_50%_42%,color-mix(in_srgb,var(--s1)_22%,transparent)_0%,color-mix(in_srgb,var(--s2)_12%,transparent)_40%,transparent_70%)]"
            />
            <div className="relative z-1">
              <Wordmark />
            </div>

            {/* Desktop only: a three.js mascot is not what a phone needs above
                the form it came to fill in. */}
            <div className="relative z-1 hidden self-center min-[821px]:flex">
              <div className="flex aspect-square w-[clamp(150px,17vw,240px)] items-center justify-center">
                {reduce ? (
                  <Image
                    src="/starburst.png"
                    alt=""
                    aria-hidden
                    width={240}
                    height={240}
                    className="w-[70%] brightness-115 drop-shadow-[0_0_40px_color-mix(in_srgb,var(--s1)_42%,transparent)]"
                  />
                ) : (
                  <HeroRobot play gaze={passwordFocused ? "away" : "form"} />
                )}
              </div>
            </div>

            <div className="relative z-1">
              <RotatingHunch />
            </div>
          </div>

          {/* Form */}
          <div className="relative flex flex-1 items-center justify-center p-[clamp(24px,4vw,56px)] min-[821px]:flex-[1_1_54%]">
            <div className="w-full max-w-[420px]">{children}</div>
          </div>
        </div>
      </div>
    </AuthGazeProvider>
  );
}
