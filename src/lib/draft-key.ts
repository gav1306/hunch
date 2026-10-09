/**
 * The idempotency key for the hunch being drafted on the new-hunch form.
 *
 * A sharpen that is interrupted (a reload, a dropped stream) can still save its
 * hunch on the server, while the form restores the same text from its draft.
 * Pressing Sharpen again used to make a second, identical hunch. The key is
 * minted per draft text and kept beside the draft, so a retry of the same words
 * sends the same key and gets the hunch already saved; new words get a new key.
 */
const STORAGE_KEY = "hunch:new-draft-key";

type Entry = { text: string; key: string };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The page-lifetime copy, for when storage is blocked (private mode, full). */
let memo: Entry | null = null;

function defaultStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(store: Store | null): Entry | null {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Entry;
  } catch {
    // Unreadable or blocked: the in-memory copy still covers this page's life.
  }
  return memo;
}

export function draftKeyFor(text: string, store: Store | null = defaultStore()): string {
  const trimmed = text.trim();
  const current = read(store);
  if (current?.text === trimmed) return current.key;

  const entry = { text: trimmed, key: crypto.randomUUID() };
  memo = entry;
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Storage full or blocked; `memo` holds it.
  }
  return entry.key;
}

/** The hunch was saved: the next draft gets a fresh key, even with the same words. */
export function clearDraftKey(store: Store | null = defaultStore()): void {
  memo = null;
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage was never available.
  }
}
