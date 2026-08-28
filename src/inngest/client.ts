import { Inngest } from "inngest";

/**
 * The scheduler.
 *
 * Hunch asks for 14 to 28 consecutive days of logging and, until this, did
 * nothing at all to bring anyone back — the largest gap between what the
 * product promises and what it ships. Inngest over a plain cron because the
 * reminders go out at each user's own hour: the sweep runs hourly and is
 * at-least-once, and the retry semantics and the local dev server are the parts
 * that would otherwise have to be written by hand.
 *
 * Dev mode is an env var (`INNGEST_DEV=1`), never a literal here — hardcoding
 * it fails silently in production.
 */
export const inngest = new Inngest({ id: "hunch" });
