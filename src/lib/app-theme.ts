import { PALETTES } from "@/components/landing/palette";

/**
 * The authed app's dark theme — near-black paper, cream ink, Riso accents.
 * Single source of truth for the `--paper/--ink/--muted/--rule/--s1/--s2`
 * custom properties every authed page reads. `AppShell` spreads this onto its
 * wrapper; shell-less authed pages (e.g. the focused add-hunch page) must spread
 * it onto their own root, or those `var(--…)` references resolve to nothing and
 * the page renders unthemed (white background, invisible buttons).
 */
const DARK = {
  paper: "#0E0D12",
  ink: "#F2ECDD",
  muted: "#8C8676",
  rule: "rgba(242,236,221,0.16)",
};
const ACCENT = PALETTES.Riso;

/** Base background/color/font + the paper/ink custom properties for the authed theme. */
export function appThemeStyle(): React.CSSProperties {
  return {
    background: DARK.paper,
    color: DARK.ink,
    fontFamily: "'Space Mono',ui-monospace,monospace",
    "--paper": DARK.paper,
    "--ink": DARK.ink,
    "--muted": DARK.muted,
    "--rule": DARK.rule,
    "--s1": ACCENT.s1,
    "--s2": ACCENT.s2,
  } as React.CSSProperties;
}
