export type Palette = {
  paper: string;
  ink: string;
  muted: string;
  rule: string;
  s1: string;
  s2: string;
};

// The landing's palette has to agree with something outside itself: every
// value is the app's own token from globals.css. The landing hands straight
// over to /signin and then /home, and a front door painted in near-misses of
// the product's colours reads as the ground shifting under the reader.
// Change these only by changing globals.css first.
export const NOIR: Palette = { paper: "#0e0d12", ink: "#f2ecdd", muted: "#8c8676", rule: "rgba(242,236,221,0.16)", s1: "#ff3b14", s2: "#7b8cff" };

/** The light-ground Riso accents. The robot's lighting keeps them in dark mode too. */
export const RISO_ACCENTS = { s1: "#FF3B14", s2: "#1F33E0" };

export const WORDS = ["guess", "test", "know"];

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
