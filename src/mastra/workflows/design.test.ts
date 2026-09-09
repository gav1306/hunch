import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/mastra/agents/protocol-designer", () => ({ designProtocolShape: vi.fn() }));
vi.mock("@/mastra/agents/safety-reviewer", () => ({ reviewSafety: vi.fn() }));

import { AUTO_APPROVE_ENABLED, designProtocol, resolveSafetyState } from "@/mastra/workflows/design";
import { designProtocolShape } from "@/mastra/agents/protocol-designer";
import { reviewSafety } from "@/mastra/agents/safety-reviewer";
import { observationalDesign, type SafetyVerdict } from "@/lib/schemas/protocol";

const approved: SafetyVerdict = { state: "approved", reason: "ok", routedToDoctor: false };
const refused: SafetyVerdict = { state: "refused", reason: "see a doctor", routedToDoctor: true };

describe("resolveSafetyState (gate enforcement)", () => {
  it("approves when the reviewer approves and auto-approval is on", () => {
    expect(resolveSafetyState(approved, true)).toBe("approved");
  });

  it("falls back to manual-confirm (pending) when auto-approval is off", () => {
    expect(resolveSafetyState(approved, false)).toBe("pending");
  });

  it("always refuses what the reviewer refused, regardless of the switch", () => {
    expect(resolveSafetyState(refused, true)).toBe("refused");
    expect(resolveSafetyState(refused, false)).toBe("refused");
  });

  it("defaults to the live AUTO_APPROVE_ENABLED switch", () => {
    expect(resolveSafetyState(approved)).toBe(AUTO_APPROVE_ENABLED ? "approved" : "pending");
  });
});

describe("designProtocol (shape)", () => {
  const base = {
    statement: "Playing basketball improves my sleep quality.",
    outcomeMetric: "sleep quality",
    outcomeType: "continuous" as const,
    confounderNames: ["caffeine"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reviewSafety).mockResolvedValue(approved);
  });

  it("passes the shape and the exposure label down to the designer", async () => {
    vi.mocked(designProtocolShape).mockResolvedValue(
      observationalDesign("sleep quality", "played basketball"),
    );

    await designProtocol({
      ...base,
      shape: "observational",
      exposureLabel: "played basketball",
    });

    expect(designProtocolShape).toHaveBeenCalledWith(
      expect.objectContaining({ shape: "observational", exposureLabel: "played basketball" }),
    );
  });

  it("still safety-reviews an observational design — the gate is not skipped", async () => {
    const design = observationalDesign("sleep quality", "played basketball");
    vi.mocked(designProtocolShape).mockResolvedValue(design);

    const result = await designProtocol({
      ...base,
      shape: "observational",
      exposureLabel: "played basketball",
    });

    expect(reviewSafety).toHaveBeenCalledWith({ statement: base.statement, design });
    expect(result.safety).toEqual(approved);
  });

  it("still runs the power tool and reports its estimate", async () => {
    vi.mocked(designProtocolShape).mockResolvedValue(
      observationalDesign("sleep quality", "played basketball"),
    );

    const result = await designProtocol({
      ...base,
      shape: "observational",
      exposureLabel: "played basketball",
    });

    expect(result.powerInfo.minDaysPerPhase).toBeGreaterThan(0);
  });
});
