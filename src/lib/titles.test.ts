import { describe, expect, it } from "vitest";
import { pageTitle } from "./titles";

describe("pageTitle", () => {
  it("uses the statement as the tab name", () => {
    expect(pageTitle("Coffee after 2pm reduces my sleep quality.")).toBe(
      "Coffee after 2pm reduces my sleep quality",
    );
  });

  it("drops a trailing full stop, which reads wrong in a tab", () => {
    expect(pageTitle("It works.")).toBe("It works");
  });

  it("truncates a long statement on a word boundary", () => {
    const long =
      "Taking a ten minute walk immediately after lunch improves my measured afternoon focus score";
    const out = pageTitle(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it("falls back for an empty statement", () => {
    expect(pageTitle("   ")).toBe("Hunch");
  });
});
