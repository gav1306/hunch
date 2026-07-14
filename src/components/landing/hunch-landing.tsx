"use client";

import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { HowItWorks } from "./how-it-works";
import { HunchTicker } from "./hunch-ticker";
import { MethodSection } from "./method-section";
import { SmoothScroll } from "./smooth-scroll";
import { VerdictReveal } from "./verdict-reveal";
import { GRAIN_SVG, PALETTES, paletteVars, type PaletteName } from "./palette";

export type HunchLandingProps = {
  palette?: PaletteName | string;
  grain?: boolean;
  wordHold?: number;
  autoplay?: boolean;
};

export function HunchLanding({
  palette = "Riso",
  grain = true,
  wordHold = 900,
  autoplay = true,
}: HunchLandingProps) {
  const P = PALETTES[palette] ?? PALETTES.Riso;

  // Dark theme across the whole page (matches the dark glossy hero).
  // Keeps brand accents (--s1/--s2); only flips the canvas + text tokens.
  const DARK = {
    paper: "#0E0D12",
    ink: "#F2ECDD",
    muted: "#8C8676",
    rule: "rgba(242,236,221,0.16)",
  };

  const grainOp = 0.05;
  const grainBlend = "soft-light";

  return (
    <SmoothScroll>
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
        @keyframes hl-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes hl-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
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
        .hl-step{transition:border-color 280ms ease, background 280ms ease;}
        .hl-step:hover{border-color:var(--ink);background:color-mix(in srgb, color-mix(in srgb,var(--paper) 88%,var(--ink)) 90%, var(--s1));}
        .hl-step-bar{transform:scaleX(0);transform-origin:left center;transition:transform 360ms cubic-bezier(.16,.9,.24,1);}
        .hl-step:hover .hl-step-bar{transform:scaleX(1);}
        .hl-step-glyph{transition:transform 360ms cubic-bezier(.16,.9,.24,1);}
        .hl-step:hover .hl-step-glyph{transform:translateY(-3px);}
        html{scroll-behavior:smooth;}
        html.lenis,html.lenis body{height:auto;}
        .lenis.lenis-smooth{scroll-behavior:auto !important;}
        .lenis.lenis-smooth [data-lenis-prevent]{overscroll-behavior:contain;}
        .lenis.lenis-stopped{overflow:hidden;}
        .lenis.lenis-smooth iframe{pointer-events:none;}
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
          overflowX: "clip",
          ...paletteVars(P),
          "--paper": DARK.paper,
          "--ink": DARK.ink,
          "--muted": DARK.muted,
          "--rule": DARK.rule,
        } as React.CSSProperties}
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

        <HeroSection wordHold={wordHold} autoplay={autoplay} />
        <HowItWorks />
        <HunchTicker />
        <VerdictReveal />
        <MethodSection />
        <FinalCta />
      </div>
    </SmoothScroll>
  );
}
