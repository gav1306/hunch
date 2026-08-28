import { describe, expect, it } from "vitest";
import {
  isReminderDue,
  localDateIn,
  localHourIn,
  signUnsubscribe,
  verifyUnsubscribe,
} from "@/lib/reminders";

const IST = "Asia/Kolkata";
const NY = "America/New_York";

describe("localHourIn", () => {
  it("reads the hour in the user's zone, not the server's", () => {
    // 18:30 UTC is midnight in Kolkata (+5:30) and 14:30 in New York.
    const at = new Date("2026-08-28T18:30:00Z");
    expect(localHourIn(IST, at)).toBe(0);
    expect(localHourIn(NY, at)).toBe(14);
    expect(localHourIn("UTC", at)).toBe(18);
  });

  it("follows a zone across its DST boundary", () => {
    // New York is UTC-4 in August and UTC-5 in January.
    expect(localHourIn(NY, new Date("2026-08-28T12:00:00Z"))).toBe(8);
    expect(localHourIn(NY, new Date("2026-01-28T12:00:00Z"))).toBe(7);
  });

  it("falls back to UTC rather than throwing on a zone it can't read", () => {
    expect(localHourIn("Not/AZone", new Date("2026-08-28T18:30:00Z"))).toBe(18);
  });
});

describe("localDateIn", () => {
  it("returns the local calendar day, keyed at UTC midnight", () => {
    // Still the 28th in New York while it is already the 29th in Kolkata.
    const at = new Date("2026-08-28T19:00:00Z");
    expect(localDateIn(NY, at).toISOString()).toBe("2026-08-28T00:00:00.000Z");
    expect(localDateIn(IST, at).toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });
});

describe("isReminderDue", () => {
  const at = new Date("2026-08-28T14:30:00Z"); // 20:00 in Kolkata

  it("is due at the user's chosen local hour", () => {
    expect(
      isReminderDue({ reminderHour: 20, timeZone: IST, lastReminderOn: null }, at),
    ).toBe(true);
  });

  it("is not due at any other hour", () => {
    expect(
      isReminderDue({ reminderHour: 21, timeZone: IST, lastReminderOn: null }, at),
    ).toBe(false);
  });

  it("is never due with reminders off", () => {
    expect(
      isReminderDue({ reminderHour: null, timeZone: IST, lastReminderOn: null }, at),
    ).toBe(false);
  });

  it("does not send twice for the same local day", () => {
    const sentToday = new Date("2026-08-28T00:00:00Z");
    expect(
      isReminderDue({ reminderHour: 20, timeZone: IST, lastReminderOn: sentToday }, at),
    ).toBe(false);
  });

  it("sends again the next day", () => {
    const sentYesterday = new Date("2026-08-27T00:00:00Z");
    expect(
      isReminderDue(
        { reminderHour: 20, timeZone: IST, lastReminderOn: sentYesterday },
        at,
      ),
    ).toBe(true);
  });

  it("reads the guard in the user's day, not the server's", () => {
    // 19:00 UTC on the 28th is 00:30 on the 29th in Kolkata. A reminder sent
    // for the 28th must not block the one due on the 29th.
    const justAfterLocalMidnight = new Date("2026-08-28T19:00:00Z");
    expect(
      isReminderDue(
        {
          reminderHour: 0,
          timeZone: IST,
          lastReminderOn: new Date("2026-08-28T00:00:00Z"),
        },
        justAfterLocalMidnight,
      ),
    ).toBe(true);
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips for the user it was signed for", () => {
    const token = signUnsubscribe("user_123");
    expect(verifyUnsubscribe("user_123", token)).toBe(true);
  });

  it("rejects another user's token", () => {
    expect(verifyUnsubscribe("user_456", signUnsubscribe("user_123"))).toBe(false);
  });

  it("rejects a tampered or empty token", () => {
    expect(verifyUnsubscribe("user_123", "")).toBe(false);
    expect(verifyUnsubscribe("user_123", "deadbeef")).toBe(false);
    const token = signUnsubscribe("user_123");
    expect(verifyUnsubscribe("user_123", token.slice(0, -1) + "0")).toBe(false);
  });
});
