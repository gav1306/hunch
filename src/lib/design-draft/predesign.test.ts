import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    hunch: { findUnique: vi.fn() },
    designDraft: { upsert: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/mastra/workflows/design", () => ({ designProtocol: vi.fn() }));

import { predesign } from "./predesign";
import { designFingerprint, designInputFor } from "./fingerprint";
import { db } from "@/lib/db";
import { designProtocol } from "@/mastra/workflows/design";

const hypothesis = {
  statement: "Playing basketball makes my knee hurt.",
  outcomeMetric: "knee pain 1-10",
  outcomeType: "continuous",
  confounders: ["stairs"],
  schedulable: true,
};
const exposure = { label: "played basketball", isExposure: true, isPrimary: false };
const primary = { label: "knee pain 1-10", isExposure: false, isPrimary: true };
const hunch = (over: Record<string, unknown> = {}) =>
  ({ id: "h1", hypothesis, parameters: [primary], ...over }) as never;

const result = { design: { shape: "phased" } };

describe("predesign", () => {
  beforeEach(() => {
    // reset, not clear: one test makes the upsert reject, and a cleared mock
    // would keep rejecting in every test after it.
    vi.resetAllMocks();
    vi.mocked(designProtocol).mockResolvedValue(result as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("marks the draft designing, designs, then stores the result under the same fingerprint", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(hunch());
    const input = designInputFor(hypothesis, { schedulable: true });
    const fingerprint = designFingerprint(input);

    await predesign("h1");

    expect(db.designDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hunchId: "h1" },
        create: { hunchId: "h1", fingerprint, status: "designing" },
        update: expect.objectContaining({ fingerprint, status: "designing" }),
      }),
    );
    expect(designProtocol).toHaveBeenCalledWith(input);
    expect(db.designDraft.updateMany).toHaveBeenCalledWith({
      where: { hunchId: "h1", fingerprint },
      data: { status: "ready", result },
    });
  });

  it("designs an observational window from the stored exposure label", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(
      hunch({ hypothesis: { ...hypothesis, schedulable: false }, parameters: [primary, exposure] }),
    );

    await predesign("h1");

    expect(designProtocol).toHaveBeenCalledWith(
      expect.objectContaining({ shape: "observational", exposureLabel: "played basketball" }),
    );
  });

  it("does nothing for an observational hunch with no named daily yes/no", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(
      hunch({ hypothesis: { ...hypothesis, schedulable: false }, parameters: [primary] }),
    );

    await predesign("h1");

    expect(db.designDraft.upsert).not.toHaveBeenCalled();
    expect(designProtocol).not.toHaveBeenCalled();
  });

  it("does nothing for a hunch that is gone or has no hypothesis", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(null);
    await predesign("h1");
    vi.mocked(db.hunch.findUnique).mockResolvedValue(hunch({ hypothesis: null }));
    await predesign("h1");

    expect(designProtocol).not.toHaveBeenCalled();
  });

  it("stores failed, and does not reject, when the design throws", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(hunch());
    vi.mocked(designProtocol).mockRejectedValue(new Error("402 out of credits"));

    await expect(predesign("h1")).resolves.toBeUndefined();

    expect(db.designDraft.updateMany).toHaveBeenCalledWith({
      where: { hunchId: "h1", fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) },
      data: { status: "failed" },
    });
  });

  it("does not reject when the database does", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(hunch());
    vi.mocked(db.designDraft.upsert).mockRejectedValue(new Error("foreign key: hunch deleted"));

    await expect(predesign("h1")).resolves.toBeUndefined();
    expect(designProtocol).not.toHaveBeenCalled();
  });
});
