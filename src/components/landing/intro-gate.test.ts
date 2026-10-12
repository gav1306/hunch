import { describe, expect, it } from "vitest";
import { INTRO_ATTR, INTRO_SEEN_KEY, introGateScript, introWillPlay } from "./intro-gate";

/** Run the inline script against a fake browser, return the attribute it set. */
function runScript(opts: { seen: boolean; reduced: boolean; storageThrows?: boolean }) {
  const dataset: Record<string, string> = {};
  const attrs: Record<string, string> = {};
  const env = {
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), dataset } },
    sessionStorage: {
      getItem: (k: string) => {
        if (opts.storageThrows) throw new Error("denied");
        return k === INTRO_SEEN_KEY && opts.seen ? "1" : null;
      },
    },
    matchMedia: () => ({ matches: opts.reduced }),
  };
  new Function("document", "sessionStorage", "matchMedia", introGateScript)(
    env.document,
    env.sessionStorage,
    env.matchMedia,
  );
  return attrs[INTRO_ATTR];
}

describe("intro gate", () => {
  it("marks the page before paint when the intro will play", () => {
    expect(runScript({ seen: false, reduced: false })).toBe("play");
  });

  it("leaves the hero visible for a repeat visit or reduced motion", () => {
    expect(runScript({ seen: true, reduced: false })).toBeUndefined();
    expect(runScript({ seen: false, reduced: true })).toBeUndefined();
  });

  it("fails open: no storage means no hidden hero", () => {
    expect(runScript({ seen: false, reduced: false, storageThrows: true })).toBeUndefined();
  });

  it("agrees with the effect's own decision", () => {
    const storage = (seen: boolean) => ({ getItem: () => (seen ? "1" : null) });
    expect(introWillPlay({ autoplay: true, reduced: false, storage: storage(false) })).toBe(true);
    expect(introWillPlay({ autoplay: true, reduced: false, storage: storage(true) })).toBe(false);
    expect(introWillPlay({ autoplay: false, reduced: false, storage: storage(false) })).toBe(false);
    expect(introWillPlay({ autoplay: true, reduced: true, storage: storage(false) })).toBe(false);
  });
});
