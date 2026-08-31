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
  // The one palette that has to agree with something outside itself. Its
  // neutrals are the app's own tokens, value for value, because the landing
  // hands straight over to /signin and then /home: a warm near-black followed
  // by a cool one reads as the ground shifting under the reader. The accents
  // stay the landing's — Riso orange and a sky blue that carries on a dark
  // ground better than the app's periwinkle.
  Noir: { paper: "#0e0d12", ink: "#f2ecdd", muted: "#8c8676", rule: "rgba(242,236,221,0.16)", s1: "#FF4A1C", s2: "#5AA0FF", dark: true },
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

