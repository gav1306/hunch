import { describe, expect, it } from "vitest";
import { AUTO_APPROVE_ENABLED, resolveSafetyState } from "@/mastra/workflows/design";
import type { SafetyVerdict } from "@/lib/schemas/protocol";

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
