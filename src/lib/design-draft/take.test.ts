import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { designDraft: { findUnique: vi.fn() } } }));

import { takeDraft } from "./take";
import { db } from "@/lib/db";
import type { DesignResult } from "@/lib/schemas/protocol";

const findUnique = vi.mocked(db.designDraft.findUnique);
const NOW = new Date("2026-09-17T10:00:00Z");

const RESULT: DesignResult = {
  confounders: [],
  design: {
    phases: [{ label: "A", kind: "baseline", days: 21, name: "Just live normally", action: "Live normally." }],
    washoutDays: 0,
    controls: [],
    instructions: "Live normally and log both questions.",
    shape: "observational",
  },
  powerInfo: { minDaysPerPhase: 7, effectSize: "medium", rationale: "a medium effect" },
  safety: { state: "approved", reason: "Low-risk lifestyle change.", routedToDoctor: false },
};

const row = (over: Record<string, unknown>) =>
  ({ hunchId: "h1", fingerprint: "fp", status: "ready", result: RESULT, updatedAt: NOW, ...over }) as never;

describe("takeDraft", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    findUnique.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when there is no draft", async () => {
    findUnique.mockResolvedValue(null);
    await expect(takeDraft("h1", "fp")).resolves.toBeNull();
  });

  it("returns null when the draft was designed from other inputs", async () => {
    findUnique.mockResolvedValue(row({ fingerprint: "other" }));
    await expect(takeDraft("h1", "fp")).resolves.toBeNull();
  });

  it("returns a ready draft's result", async () => {
    findUnique.mockResolvedValue(row({}));
    await expect(takeDraft("h1", "fp")).resolves.toEqual(RESULT);
    expect(findUnique).toHaveBeenCalledWith({ where: { hunchId: "h1" } });
  });

  it("returns null when a ready draft's result doesn't parse", async () => {
    findUnique.mockResolvedValue(row({ result: { design: "not a design" } }));
    await expect(takeDraft("h1", "fp")).resolves.toBeNull();
  });

  it("returns null for a failed draft", async () => {
    findUnique.mockResolvedValue(row({ status: "failed", result: null }));
    await expect(takeDraft("h1", "fp")).resolves.toBeNull();
  });

  it("waits for a draft still being designed", async () => {
    const designing = row({ status: "designing", result: null });
    findUnique.mockResolvedValueOnce(designing).mockResolvedValueOnce(designing).mockResolvedValue(row({}));

    const taken = takeDraft("h1", "fp");
    await vi.advanceTimersByTimeAsync(500);

    await expect(taken).resolves.toEqual(RESULT);
    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it("gives up after 10s on a draft that never finishes", async () => {
    findUnique.mockResolvedValue(row({ status: "designing", result: null }));

    const taken = takeDraft("h1", "fp");
    await vi.advanceTimersByTimeAsync(10_250);

    await expect(taken).resolves.toBeNull();
  });

  it("doesn't wait on a designing row older than 30s — its work was cut off", async () => {
    findUnique.mockResolvedValue(
      row({ status: "designing", result: null, updatedAt: new Date(NOW.getTime() - 31_000) }),
    );

    await expect(takeDraft("h1", "fp")).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
