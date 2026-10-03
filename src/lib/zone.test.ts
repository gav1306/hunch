import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: vi.fn() } } }));

import {
  CURRENT_ZONE_NAMES,
  canonicalZone,
  knownZone,
  localToday,
  sameZone,
  userTimeZone,
  zoneName,
} from "@/lib/zone";
import { db } from "@/lib/db";

describe("localToday", () => {
  it("is still yesterday in Los Angeles when UTC has rolled over", () => {
    // 03:00Z on the 23rd is 20:00 on the 22nd in PDT.
    const at = new Date("2026-09-23T03:00:00.000Z");
    expect(localToday("America/Los_Angeles", at).toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("is already tomorrow in Kolkata before UTC rolls over", () => {
    // 20:00Z on the 22nd is 01:30 on the 23rd in IST.
    const at = new Date("2026-09-22T20:00:00.000Z");
    expect(localToday("Asia/Kolkata", at).toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });

  it("matches UTC midnight for UTC", () => {
    const at = new Date("2026-09-22T23:59:59.000Z");
    expect(localToday("UTC", at).toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("falls back to UTC for a zone it can't read", () => {
    const at = new Date("2026-09-23T03:00:00.000Z");
    expect(localToday("Not/AZone", at).toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });
});

describe("canonicalZone", () => {
  it("canonicalises a case variant", () => {
    expect(canonicalZone("america/los_angeles")).toBe("America/Los_Angeles");
  });

  it("returns undefined for garbage", () => {
    expect(canonicalZone("Not/AZone")).toBeUndefined();
  });
});

describe("knownZone", () => {
  it("keeps the zone as sent, alias and all", () => {
    // Node's ICU spells Asia/Kolkata "Asia/Calcutta"; the user should never see that.
    expect(knownZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("swaps a legacy alias a browser sends for the zone's current name", () => {
    // Chromium 139 reports India's zone as "Asia/Calcutta" itself.
    expect(knownZone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(knownZone("Europe/Kiev")).toBe("Europe/Kyiv");
  });

  it("returns undefined for garbage or nothing", () => {
    expect(knownZone("Not/AZone")).toBeUndefined();
    expect(knownZone(undefined)).toBeUndefined();
  });
});

describe("zoneName", () => {
  it("shows a stored legacy alias by the zone's current name", () => {
    expect(zoneName("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(zoneName("Asia/Saigon")).toBe("Asia/Ho_Chi_Minh");
  });

  it("leaves every other zone alone", () => {
    expect(zoneName("America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(zoneName("UTC")).toBe("UTC");
  });

  it("names only zones the runtime recognises", () => {
    for (const current of Object.values(CURRENT_ZONE_NAMES)) {
      expect(canonicalZone(current)).toBeDefined();
    }
  });
});

describe("sameZone", () => {
  it("treats an alias and a case variant as the same zone", () => {
    expect(sameZone("Asia/Kolkata", "Asia/Calcutta")).toBe(true);
    expect(sameZone("america/los_angeles", "America/Los_Angeles")).toBe(true);
  });

  it("tells different zones apart", () => {
    expect(sameZone("Asia/Kolkata", "UTC")).toBe(false);
  });
});

describe("userTimeZone", () => {
  it("returns the stored zone", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ timeZone: "Asia/Kolkata" } as never);
    expect(await userTimeZone("u1")).toBe("Asia/Kolkata");
  });

  it("falls back to UTC when there is no user row", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);
    expect(await userTimeZone("u1")).toBe("UTC");
  });
});
