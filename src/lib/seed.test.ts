import { describe, expect, it } from "vitest";
import { parseSeed } from "./seed";

describe("parseSeed", () => {
  it("returns empty string for undefined", () => {
    expect(parseSeed(undefined)).toBe("");
  });

  it("returns empty string for null", () => {
    expect(parseSeed(null)).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(parseSeed("  coffee wrecks my sleep  ")).toBe("coffee wrecks my sleep");
  });

  it("passes a normal seed through unchanged", () => {
    expect(parseSeed("Does coffee after lunch wreck my sleep?")).toBe(
      "Does coffee after lunch wreck my sleep?",
    );
  });

  it("collapses a whitespace-only seed to empty", () => {
    expect(parseSeed("   ")).toBe("");
  });
});
