import { describe, expect, it } from "vitest";
import { buildReminder, type ReminderHunch } from "@/lib/reminder-email";

const ONE: ReminderHunch = {
  id: "h1",
  statement: "Coffee after 2pm costs me 40 minutes of sleep.",
  phaseAction: "No coffee after 2pm today.",
  day: 4,
  total: 14,
};

const TWO: ReminderHunch = {
  id: "h2",
  statement: "A morning walk lifts my afternoon focus.",
  phaseAction: "Walk 10 minutes before 9am.",
  day: 2,
  total: 10,
};

const base = { name: "Ada", appUrl: "https://hunch.test", unsubscribeUrl: "https://hunch.test/u?t=x" };

describe("buildReminder", () => {
  it("names the one thing to do, not just the hunch", () => {
    const mail = buildReminder({ ...base, hunches: [ONE] });
    expect(mail.subject).toBe("Day 4 of 14 — time to log");
    expect(mail.text).toContain("No coffee after 2pm today.");
    expect(mail.text).toContain("https://hunch.test/hunch/h1");
  });

  it("uses a plural subject when more than one trial is running", () => {
    const mail = buildReminder({ ...base, hunches: [ONE, TWO] });
    expect(mail.subject).toBe("2 experiments to log today");
    expect(mail.text).toContain(ONE.statement);
    expect(mail.text).toContain(TWO.statement);
  });

  it("counts the trials rather than assuming there are two", () => {
    const three = buildReminder({ ...base, hunches: [ONE, TWO, { ...ONE, id: "h3" }] });
    expect(three.text).toContain("covers all 3");
    expect(three.text).not.toContain("both");
  });

  it("always carries a way out", () => {
    const mail = buildReminder({ ...base, hunches: [ONE] });
    expect(mail.text).toContain(base.unsubscribeUrl);
  });

  it("says nothing about a phase with no instruction", () => {
    const mail = buildReminder({
      ...base,
      hunches: [{ ...ONE, phaseAction: null }],
    });
    expect(mail.text).toContain("Log today's reading");
    expect(mail.text).not.toContain("null");
  });

  it("refuses to compose an email with nothing in it", () => {
    expect(() => buildReminder({ ...base, hunches: [] })).toThrow();
  });
});
