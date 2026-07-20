import { describe, it, expect } from "vitest";
import { composeInstructions } from "./protocol-designer";
import { protocolDesignSchema } from "@/lib/schemas/protocol";

describe("composeInstructions", () => {
  const design = {
    phases: [
      { label: "A" as const, kind: "baseline" as const, days: 7 },
      { label: "B" as const, kind: "intervention" as const, days: 7 },
      { label: "A" as const, kind: "baseline" as const, days: 7 },
    ],
    washoutDays: 2,
    controls: ["Hold caffeine constant.", "Keep sleep schedule steady."],
  };

  it("produces a non-empty string that satisfies the schema's instructions field", () => {
    const instructions = composeInstructions(design, "sleep quality");
    expect(instructions.length).toBeGreaterThan(0);
    // The exact failure mode from the 500: instructions must parse.
    expect(() =>
      protocolDesignSchema.parse({ ...design, instructions }),
    ).not.toThrow();
  });

  it("references each phase, the washout, and every control", () => {
    const out = composeInstructions(design, "sleep quality");
    expect(out).toContain("Phase 1");
    expect(out).toContain("Phase 3");
    expect(out).toContain("sleep quality");
    expect(out).toContain("2-day washout");
    for (const c of design.controls) expect(out).toContain(c);
  });

  it("omits the washout line when washoutDays is 0", () => {
    const out = composeInstructions({ ...design, washoutDays: 0 }, "mood");
    expect(out).not.toContain("washout");
  });
});
