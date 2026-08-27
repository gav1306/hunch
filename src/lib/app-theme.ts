/**
 * The authed app's base style.
 *
 * The palette itself — `--paper/--ink/--muted/--rule/--s1/--s2` plus the
 * `--good/--bad/--neutral` result semantics — is declared once on `:root` in
 * globals.css. This helper no longer restates those values; it only anchors
 * background, colour and face on a page root so a shell-less authed page
 * (the focused add-hunch page, the protocol page, the dashboard) paints the
 * same ground as one wrapped in AppShell.
 *
 * Kept as a function rather than a constant so callers can keep spreading it.
 */
export function appThemeStyle(): React.CSSProperties {
  return {
    background: "var(--paper)",
    color: "var(--ink)",
    fontFamily: "var(--font-mono)",
  };
}
