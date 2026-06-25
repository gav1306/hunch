import { describe, expect, it } from "vitest";
import { detectConfounders } from "@/mastra/tools/confounder-detection";
import { confounderSchema } from "@/lib/schemas/protocol";

describe("detectConfounders", () => {
  it("returns an empty array for no confounders", () => {
    expect(detectConfounders([])).toEqual([]);
  });

  it("maps a known keyword to its specific control and type", () => {
    const [c] = detectConfounders(["afternoon coffee"]);
    expect(confounderSchema.safeParse(c).success).toBe(true);
    expect(c.name).toBe("afternoon coffee");
    expect(c.control).toMatch(/caffeine/i);
  });

  it("classifies sleep as physiological", () => {
    expect(detectConfounders(["poor sleep"])[0].type).toBe("physiological");
  });

  it("falls back to a generic control for unknown confounders", () => {
    const [c] = detectConfounders(["office politics"]);
    expect(c.type).toBe("behavioral");
    expect(c.control).toMatch(/office politics/);
  });

  it("preserves order and count", () => {
    expect(detectConfounders(["stress", "travel"]).map((c) => c.name)).toEqual(["stress", "travel"]);
  });
});
