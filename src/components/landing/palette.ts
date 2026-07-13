export type Palette = {
  paper: string;
  ink: string;
  muted: string;
  rule: string;
  s1: string;
  s2: string;
  dark: boolean;
};

export const PALETTES: Record<string, Palette> = {
  Riso: { paper: "#EDE7D9", ink: "#17140E", muted: "#6E6656", rule: "rgba(23,20,14,0.20)", s1: "#FF3B14", s2: "#1F33E0", dark: false },
  Fuchsia: { paper: "#EFE6E7", ink: "#171015", muted: "#6E5F64", rule: "rgba(23,16,21,0.20)", s1: "#FF2E7E", s2: "#2B2BFF", dark: false },
  Citrus: { paper: "#ECE9D4", ink: "#14150E", muted: "#6B6A52", rule: "rgba(20,21,14,0.20)", s1: "#F24405", s2: "#1E7A3C", dark: false },
  Noir: { paper: "#14110C", ink: "#EFE7D6", muted: "#9B9384", rule: "rgba(239,231,214,0.20)", s1: "#FF4A1C", s2: "#5AA0FF", dark: true },
};

export type PaletteName = keyof typeof PALETTES;

export const WORDS = ["guess", "test", "know"];

export const GRAIN_SVG =
  "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')";

/** CSS custom-property bag for a palette, spread onto a wrapper element. */
export function paletteVars(p: Palette): React.CSSProperties {
  return {
    "--paper": p.paper,
    "--ink": p.ink,
    "--muted": p.muted,
    "--rule": p.rule,
    "--s1": p.s1,
    "--s2": p.s2,
  } as React.CSSProperties;
}

export type BandTone = "paper" | "tintBlue" | "tintRed" | "ink";

/**
 * Full-bleed section background. `ink` flips paper/ink so var-driven children
 * invert automatically; the tints just recolor the canvas and keep dark text.
 */
export function bandStyle(tone: BandTone, p: Palette): React.CSSProperties {
  switch (tone) {
    case "tintBlue":
      return {
        background: `color-mix(in srgb, ${p.paper} 90%, ${p.s2})`,
      };
    case "tintRed":
      return {
        background: `color-mix(in srgb, ${p.paper} 92%, ${p.s1})`,
      };
    case "ink":
      return {
        background: p.ink,
        "--paper": p.ink,
        "--ink": p.paper,
        "--muted": `color-mix(in srgb, ${p.paper} 58%, ${p.ink})`,
        "--rule": `color-mix(in srgb, ${p.paper} 22%, transparent)`,
      } as React.CSSProperties;
    case "paper":
    default:
      return { background: p.paper };
  }
}
