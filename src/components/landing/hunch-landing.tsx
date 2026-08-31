"use client";

import { FinalCta } from "./final-cta";
import { HeroSection } from "./hero-section";
import { HowItWorks } from "./how-it-works";
import { HunchTicker } from "./hunch-ticker";
import { MethodSection } from "./method-section";
import { SmoothScroll } from "./smooth-scroll";
import { VerdictReveal } from "./verdict-reveal";
import { PALETTES, paletteVars, type PaletteName } from "./palette";

export type HunchLandingProps = {
  palette?: PaletteName | string;
  grain?: boolean;
  wordHold?: number;
  autoplay?: boolean;
};

export function HunchLanding({
  palette = "Noir",
  grain = true,
  wordHold = 900,
  autoplay = true,
}: HunchLandingProps) {
  const P = PALETTES[palette] ?? PALETTES.Riso;

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
        /* The base colour lives here, not inline: an inline color declaration
           beats any class rule, so the hover and focus states below repainted
           the ground and never the text — a cream button with cream letters. */
        .hl-signin{transition:background 180ms ease,color 180ms ease,border-color 180ms ease;border:1px solid var(--ink);color:var(--ink);}
        .hl-signin:hover{background:var(--ink);color:var(--paper);}
        /* Focus takes the landing blue rather than the orange the app uses,
           so a keyboard walker can tell "focused" from "hovered" at a glance. */
        .hl-signin:focus-visible{background:var(--s2);border-color:var(--s2);color:var(--paper);outline-color:var(--s2);}
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

      {/* `--paper/--ink/--muted/--rule` used to be redeclared here with the
          same four values that live on `:root`. The palette vars stay: the
          landing keeps its own Riso accents, which is the one place in the
          product that still wants the light-ground `--s2`. */}
      <main
        className="hl-root"
        style={{
          position: "relative",
          minHeight: "100dvh",
          background: "var(--paper)",
          color: "var(--ink)",
          fontFamily: "var(--font-mono)",
          overflowX: "clip",
          ...paletteVars(P),
        } as React.CSSProperties}
      >
        {/* page-wide grain */}
        {grain && (
          <div aria-hidden className="grain-overlay" />
        )}

        <HeroSection wordHold={wordHold} autoplay={autoplay} />
        <HowItWorks />
        <HunchTicker />
        <VerdictReveal />
        <MethodSection />
        <FinalCta />
      </main>
    </SmoothScroll>
  );
}
