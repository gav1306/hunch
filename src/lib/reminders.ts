import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * When a daily reminder is due, and who it is for.
 *
 * The hard part is that "8pm" is a local hour and the sweep that sends them
 * runs in UTC. Everything here reads the user's own zone: the hour they chose,
 * and the calendar day the send is filed under. Getting the second one wrong is
 * subtle — a UTC-day guard sends twice on the day a user's local midnight falls
 * before UTC's, and skips a day on the other side of the map.
 */

/** What the sweep needs to know about a user to decide. */
export type ReminderPrefs = {
  reminderHour: number | null;
  timeZone: string;
  lastReminderOn: Date | null;
};

/** `Intl` parts for an instant, in a zone, with UTC as the fallback. */
function partsIn(timeZone: string, at: Date): Record<string, string> {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    });
  } catch {
    // A zone we can't read is a stored string we no longer recognise; UTC is
    // wrong by hours, but sending at the wrong hour beats not sending at all.
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    });
  }
  return Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
}

/** The hour (0-23) it is in `timeZone` at instant `at`. */
export function localHourIn(timeZone: string, at: Date): number {
  // `hour12: false` renders midnight as "24" in some ICU versions.
  return Number(partsIn(timeZone, at).hour) % 24;
}

/**
 * The calendar day it is in `timeZone`, keyed at UTC midnight — the same shape
 * as `CheckIn.loggedOn` and `utcToday`, so the two can be compared directly.
 */
export function localDateIn(timeZone: string, at: Date): Date {
  const p = partsIn(timeZone, at);
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}

/**
 * Is this user's reminder due right now?
 *
 * The sweep runs hourly and is at-least-once, so this is deliberately a pure
 * predicate over stored state: the chosen hour has arrived in the user's zone,
 * and nothing has been sent for that local day yet.
 */
export function isReminderDue(prefs: ReminderPrefs, at: Date = new Date()): boolean {
  if (prefs.reminderHour === null) return false;
  if (localHourIn(prefs.timeZone, at) !== prefs.reminderHour) return false;
  if (prefs.lastReminderOn === null) return true;
  return prefs.lastReminderOn.getTime() < localDateIn(prefs.timeZone, at).getTime();
}

/** The 24 hours, as the setting offers them. */
export const REMINDER_HOURS = Array.from({ length: 24 }, (_, h) => h);

/** "8:00 pm" — how an hour reads in the setting and in the email. */
export function formatHour(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${suffix}`;
}

/**
 * The signature on an unsubscribe link.
 *
 * Unsubscribing has to work from an email client with no session, so the link
 * carries its own authority: an HMAC over the user id under the app secret.
 * There is nothing to store and nothing to expire — the link stays good for as
 * long as the account does, which is what an unsubscribe link should do.
 */
export function signUnsubscribe(userId: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(`unsubscribe:${userId}`).digest("hex");
}

/** Constant-time check of the signature on an unsubscribe link. */
export function verifyUnsubscribe(userId: string, token: string): boolean {
  const expected = signUnsubscribe(userId);
  if (token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"));
}
