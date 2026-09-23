import "server-only";

import { db } from "@/lib/db";
import { localDateIn } from "@/lib/reminders";

/**
 * Which calendar day it is for a user.
 *
 * Days are stored as UTC midnight of a calendar date — `CheckIn.loggedOn`,
 * `Protocol.startedAt` — and that doesn't change here. What does is which date
 * "now" is: the user's own, from the zone recorded at trial start (and by the
 * reminder settings), rather than UTC's. Cutting days at UTC midnight put a
 * Californian's 8pm check-in on tomorrow, and refused it outright on the last
 * day of a trial.
 */

/**
 * The runtime's canonical spelling of a zone — "asia/kolkata" and "Asia/Kolkata"
 * both become whatever Intl considers the one true id — or undefined when the
 * runtime doesn't recognise it. A client-sent zone is free-text (case, and
 * sometimes the alias, vary by device); comparing and storing it uncanonicalised
 * made an unchanged zone look like a move and trip the refresh write.
 */
export function canonicalZone(zone: string): string | undefined {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Today in `timeZone`, as the UTC-midnight key a check-in is filed under. */
export function localToday(timeZone: string, now: Date = new Date()): Date {
  return localDateIn(timeZone, now);
}

/** The user's stored zone. `"UTC"` — the column's default — when there is no row. */
export async function userTimeZone(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
  return user?.timeZone ?? "UTC";
}
