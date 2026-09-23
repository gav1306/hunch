import { describe, expect, it } from "vitest";
import { browserToday } from "@/lib/browser-day";

describe("browserToday", () => {
  it("keys the browser's own calendar date at UTC midnight", () => {
    // Built with the local-time constructor, so this holds in any TZ the suite runs in.
    const lateEvening = new Date(2026, 8, 22, 23, 30);
    expect(browserToday(lateEvening).toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("keys just after local midnight to the new day", () => {
    const justAfter = new Date(2026, 8, 23, 0, 5);
    expect(browserToday(justAfter).toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });
});
