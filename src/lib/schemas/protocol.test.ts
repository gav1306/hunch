import { describe, expect, it } from "vitest";
import {
  canRun,
  confounderSchema,
  designResultSchema,
  parseStoredDesign,
  powerInfoSchema,
  protocolDesignSchema,
  protocolPhaseSchema,
  observeOnlyDesign,
  OBSERVE_DAYS,
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

  it("accepts a single-phase design, which is what a diary is", () => {
    // The floor used to be two, standing in for "this is a real experiment".
    // observe-only made that wrong: one baseline arm and nothing to contrast.
    expect(
      protocolDesignSchema.safeParse({ ...design, phases: [design.phases[0]] }).success,
    ).toBe(true);
  });

  it("still rejects a design with no phases at all", () => {
    expect(protocolDesignSchema.safeParse({ ...design, phases: [] }).success).toBe(false);
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

describe("observeOnlyDesign", () => {
  const design = observeOnlyDesign("hours of sleep");

  it("has exactly one phase — there is nothing to contrast", () => {
    expect(design.phases).toHaveLength(1);
  });

  it("reuses the baseline label so the schedule needs no third case", () => {
    expect(design.phases[0]).toMatchObject({
      label: "A",
      kind: "baseline",
      days: OBSERVE_DAYS,
    });
  });

  it("asks the user to change nothing", () => {
    expect(design.phases[0].action.toLowerCase()).toContain("change nothing");
  });

  it("names the thing being logged, so the phase card isn't generic", () => {
    expect(design.phases[0].action).toContain("hours of sleep");
  });

  it("has no washout — a washout separates arms, and there is one arm", () => {
    expect(design.washoutDays).toBe(0);
  });

  it("passes the stored-design parser the dashboard reads through", () => {
    expect(() => parseStoredDesign(design, "hours of sleep")).not.toThrow();
  });

  it("still rejects an empty phase list", () => {
    expect(protocolDesignSchema.safeParse({ ...design, phases: [] }).success).toBe(false);
  });
});

describe("canRun", () => {
  it("a diary runs, like an approved trial", () => {
    expect(canRun("observe-only")).toBe(true);
    expect(canRun("approved")).toBe(true);
  });

  it("nothing else does", () => {
    expect(canRun("pending")).toBe(false);
    expect(canRun("refused")).toBe(false);
    expect(canRun("")).toBe(false);
  });
});
