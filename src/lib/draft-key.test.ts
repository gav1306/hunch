import { describe, expect, it } from "vitest";
import { clearDraftKey, draftKeyFor } from "@/lib/draft-key";

/** A Storage stand-in; node has no localStorage. */
function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe("draftKeyFor", () => {
  it("gives the same text the same key, across reloads", () => {
    const storage = memoryStorage();
    expect(draftKeyFor("coffee wrecks sleep", storage)).toBe(draftKeyFor("coffee wrecks sleep", storage));
  });

  it("mints a new key when the text changes", () => {
    const storage = memoryStorage();
    const first = draftKeyFor("coffee wrecks sleep", storage);
    expect(draftKeyFor("tea wrecks sleep", storage)).not.toBe(first);
  });

  it("mints a new key once the hunch was saved", () => {
    const storage = memoryStorage();
    const first = draftKeyFor("coffee wrecks sleep", storage);
    clearDraftKey(storage);
    expect(draftKeyFor("coffee wrecks sleep", storage)).not.toBe(first);
  });

  it("still returns a key when storage is unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {},
    };
    expect(draftKeyFor("x", broken)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
