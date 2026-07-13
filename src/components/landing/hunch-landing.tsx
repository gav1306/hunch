"use client";

import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { HowItWorks } from "./how-it-works";
import { HunchTicker } from "./hunch-ticker";
import { MethodSection } from "./method-section";
import { VerdictReveal } from "./verdict-reveal";
import { GRAIN_SVG, PALETTES, paletteVars, type PaletteName } from "./palette";

export type HunchLandingProps = {
  palette?: PaletteName | string;
  grain?: boolean;
  showMeter?: boolean;
  beliefTarget?: number;
  wordHold?: number;
  autoplay?: boolean;
  startHref?: string;
};

export function HunchLanding({
  palette = "Riso",
  grain = true,
  showMeter = true,
  beliefTarget = 82,
  wordHold = 900,
  autoplay = true,
  startHref = "/hunch/new",
}: HunchLandingProps) {
  const P = PALETTES[palette] ?? PALETTES.Riso;

  const grainOp = P.dark ? 0.05 : 0.07;
  const grainBlend = P.dark ? "soft-light" : "multiply";

  return (
    <>
      <style>{`
        @keyframes hl-live{0%,45%{opacity:1}55%,100%{opacity:.15}}
        @keyframes hl-arrow{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
        @keyframes hl-wobble{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
        @keyframes hl-sparkle{0%,100%{transform:rotate(0deg) scale(1)}50%{transform:rotate(45deg) scale(1.12)}}
        @keyframes hl-needle{0%,100%{transform:translateX(-50%) scaleY(1)}50%{transform:translateX(-50%) scaleY(1.14)}}
        @keyframes hl-echo{0%{transform:scale(1);opacity:.9}100%{transform:scale(3.4);opacity:0}}
        @keyframes hl-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
        @keyframes hl-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes hl-marquee-rev{from{transform:translateX(-50%)}to{transform:translateX(0)}}
        .hl-navlink{color:var(--muted);transition:color 180ms ease;}
        .hl-navlink:hover{color:var(--ink);}
        .hl-signin{transition:background 180ms ease,color 180ms ease;}
        .hl-signin:hover{background:var(--ink);color:var(--paper);}
        .hl-cta{transition:background 200ms ease;}
        .hl-cta:hover{background:var(--s1);}
        .hl-cta-inv{transition:background 200ms ease,color 200ms ease;}
        .hl-cta-inv:hover{background:var(--s1);color:var(--paper);}
        .hl-secondary{transition:border-color 200ms ease;}
        .hl-secondary:hover{border-color:var(--ink);}
        .hl-replay{transition:color 200ms ease,opacity 720ms ease;}
        .hl-replay:hover{color:var(--ink);}
        html{scroll-behavior:smooth;}
        @media (prefers-reduced-motion: reduce){
          html{scroll-behavior:auto;}
          .hl-root *{animation:none !important;transition-duration:0ms !important;}
        }
      `}</style>

      <div
        className="hl-root"
        style={{
          position: "relative",
          minHeight: "100vh",
          background: "var(--paper)",
          color: "var(--ink)",
          fontFamily: "'Space Mono',ui-monospace,monospace",
          overflowX: "hidden",
          ...paletteVars(P),
        }}
      >
        {/* page-wide grain */}
        {grain && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 40,
              pointerEvents: "none",
              opacity: grainOp,
              mixBlendMode: grainBlend as React.CSSProperties["mixBlendMode"],
              backgroundImage: GRAIN_SVG,
            }}
          />
        )}

        <HeroSection
          palette={P}
          showMeter={showMeter}
          beliefTarget={beliefTarget}
          wordHold={wordHold}
          autoplay={autoplay}
          startHref={startHref}
        />
        <HowItWorks />
        <HunchTicker />
        <VerdictReveal />
        <MethodSection />
        <FinalCta startHref={startHref} />
      </div>
    </>
  );
}
