import { describe, expect, it } from "vitest";
import {
  confounderSchema,
  designResultSchema,
  parseStoredDesign,
  powerInfoSchema,
  protocolDesignSchema,
  protocolPhaseSchema,
  safetyVerdictSchema,
} from "@/lib/schemas/protocol";

describe("protocol schemas", () => {
  const confounder = {
    name: "afternoon caffeine",
    type: "behavioral" as const,
    expectedDirection: "unknown" as const,
    control: "Hold caffeine intake constant throughout the experiment.",
  };
  const design = {
    phases: [
      { label: "A" as const, kind: "baseline" as const, days: 7, name: "Normal coffee", action: "Keep your usual coffee; log sleep each morning." },
      { label: "B" as const, kind: "intervention" as const, days: 7, name: "No coffee after 2pm", action: "Skip caffeine after 2pm; log sleep each morning." },
      { label: "A" as const, kind: "baseline" as const, days: 7, name: "Normal coffee", action: "Back to usual coffee; log sleep each morning." },
    ],
    washoutDays: 2,
    controls: ["Hold caffeine intake constant throughout the experiment."],
    instructions: "Track your sleep every morning for all three phases.",
  };
  const powerInfo = { minDaysPerPhase: 7, rationale: "x", effectSize: "medium" as const };
  const safety = { state: "approved" as const, reason: "x", routedToDoctor: false };

  it("accepts a valid confounder", () => {
    expect(confounderSchema.safeParse(confounder).success).toBe(true);
  });

  it("accepts a valid ABA design", () => {
    expect(protocolDesignSchema.safeParse(design).success).toBe(true);
  });

  it("rejects a design with fewer than two phases", () => {
    expect(
      protocolDesignSchema.safeParse({ ...design, phases: [design.phases[0]] }).success,
    ).toBe(false);
  });

  it("rejects a non-integer minDaysPerPhase", () => {
    expect(powerInfoSchema.safeParse({ ...powerInfo, minDaysPerPhase: 7.5 }).success).toBe(false);
  });

  it("rejects an unknown safety state", () => {
    expect(safetyVerdictSchema.safeParse({ ...safety, state: "maybe" }).success).toBe(false);
  });

  it("accepts a full design result", () => {
    expect(
      designResultSchema.safeParse({ confounders: [confounder], design, powerInfo, safety }).success,
    ).toBe(true);
  });
});

describe("protocolPhaseSchema name/action", () => {
  it("requires a non-empty name and action", () => {
    const ok = protocolPhaseSchema.safeParse({
      label: "B",
      kind: "intervention",
      days: 7,
      name: "No coffee after 2pm",
      action: "Skip all caffeine after 2pm; log your sleep score each morning.",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a phase missing action", () => {
    const bad = protocolPhaseSchema.safeParse({
      label: "A",
      kind: "baseline",
      days: 7,
      name: "Normal coffee",
    });
    expect(bad.success).toBe(false);
  });
});

describe("parseStoredDesign (tolerates pre-name/action rows)", () => {
  // A design as stored before name/action existed on the phase schema.
  const legacy = {
    phases: [
      { label: "A", kind: "baseline", days: 7 },
      { label: "B", kind: "intervention", days: 7 },
      { label: "A", kind: "baseline", days: 7 },
    ],
    washoutDays: 0,
    controls: ["Keep sleep constant."],
    instructions: "Log your sleep each morning.",
  };

  it("backfills name/action so a legacy design parses", () => {
    const design = parseStoredDesign(legacy, "sleep score");
    expect(design.phases).toHaveLength(3);
    expect(design.phases[0].name).toBe("Baseline");
    expect(design.phases[1].name).toBe("Intervention");
    expect(design.phases[0].action).toContain("sleep score");
    expect(design.phases[1].action.length).toBeGreaterThan(0);
  });

  it("preserves name/action already present", () => {
    const withNames = {
      ...legacy,
      phases: legacy.phases.map((p, i) => ({ ...p, name: `Phase ${i}`, action: `Do thing ${i}.` })),
    };
    const design = parseStoredDesign(withNames);
    expect(design.phases[1].name).toBe("Phase 1");
    expect(design.phases[1].action).toBe("Do thing 1.");
  });
});
