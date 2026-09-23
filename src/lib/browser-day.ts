/**
 * The browser's side of "which day is it". Client-safe: no server imports.
 *
 * The server judges a check-in by the user's stored zone, and every check-in
 * refreshes that zone from `browserZone()`, so the two agree on the device the
 * user is holding.
 */

/** The browser's own zone, when it will tell us. */
export function browserZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** The browser's calendar date, keyed at UTC midnight like `CheckIn.loggedOn`. */
export function browserToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
