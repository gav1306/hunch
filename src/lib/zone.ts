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
 * The runtime's canonical spelling of a zone — "america/los_angeles" and
 * "US/Pacific" both become "America/Los_Angeles" — or undefined when the runtime
 * doesn't recognise it. For comparing zones only: ICU's canonical id can be a
 * legacy alias (Node spells Asia/Kolkata "Asia/Calcutta"), so it is never what
 * gets stored or shown.
 */
export function canonicalZone(zone: string): string | undefined {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** A client-sent zone, as sent, when the runtime recognises it; undefined otherwise. */
export function knownZone(zone: string | undefined): string | undefined {
  return zone !== undefined && canonicalZone(zone) !== undefined ? zone : undefined;
}

/**
 * Do two zone strings name the same zone? A client-sent zone is free-text (case,
 * and sometimes the alias, vary by device); comparing it raw made an unchanged
 * zone look like a move and trip the refresh write.
 */
export function sameZone(a: string, b: string): boolean {
  return canonicalZone(a) === canonicalZone(b);
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
