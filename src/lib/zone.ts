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

/** Does this runtime recognise the zone? Anything else is not worth storing. */
export function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
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
