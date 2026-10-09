/**
 * Whether the landing's word-cycle intro plays, decided before first paint.
 *
 * The hero copy used to be server-rendered invisible and revealed by React, so
 * every visitor — repeat ones, reduced-motion ones, crawlers, anyone without
 * JavaScript — waited on hydration and a timer to see the headline, and
 * without JS it never appeared. Now the copy renders visible, and this script,
 * inlined ahead of the hero, marks <html> only when the intro will actually
 * run; CSS hides the copy under that mark until the intro finishes. Any
 * failure leaves the mark off, so the page fails open, visible.
 */
export const INTRO_SEEN_KEY = "hunch:intro-seen";
export const INTRO_ATTR = "data-hunch-intro";

type Storage = { getItem(key: string): string | null };

/** The rule both the inline script and its tests run. Must stay self-contained. */
function decide(storage: Storage, reduced: boolean, key: string): boolean {
  try {
    return !reduced && storage.getItem(key) !== "1";
  } catch {
    return false;
  }
}

export function introWillPlay({
  autoplay,
  reduced,
  storage,
}: {
  autoplay: boolean;
  reduced: boolean;
  storage: Storage;
}): boolean {
  return autoplay && decide(storage, reduced, INTRO_SEEN_KEY);
}

/** Inlined before the hero; marks <html> when the intro will play. */
export const introGateScript = `try{var r=!!(matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);if((${decide.toString()})(sessionStorage,r,${JSON.stringify(INTRO_SEEN_KEY)}))document.documentElement.setAttribute(${JSON.stringify(INTRO_ATTR)},"play")}catch(e){}`;

/** Hides the intro-controlled hero pieces while the mark is on. */
export const introGateCss = `html[${INTRO_ATTR}="play"] [data-intro-hide]{opacity:0!important}`;
