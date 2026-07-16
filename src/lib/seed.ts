/**
 * Normalize a `?seed=` query value into a textarea prefill.
 * Next's `searchParams` already URL-decodes the value, so this only trims and
 * handles the absent case — do NOT decodeURIComponent again (would corrupt a
 * literal `%`).
 */
export function parseSeed(raw?: string | null): string {
  return (raw ?? "").trim();
}
