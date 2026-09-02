import { describe, expect, test } from "vitest";
import { medicationIntent } from "@/lib/safety/medication";

describe("medicationIntent", () => {
  test.each([
    "I want to see if I feel better when I stop taking my statin",
    "Do I sleep better if I skip my antidepressant?",
    "off my meds for a week to see what happens",
    "how I feel without my blood pressure pills",
    "trying a half dose of my thyroid medication",
    "taking my metformin every other day instead",
    "cutting my dose of sertraline in half",
  ])("catches: %s", (text) => {
    expect(medicationIntent(text)).toBe(true);
  });

  test.each([
    "coffee after lunch wrecks my sleep",
    "I get more headaches on days I stare at screens late",
    "my houseplants droop when I play music",
    // Taking something as prescribed is not a variation, and must not be
    // caught: this is exactly the hunch observe-only exists to keep.
    "I want to track how I feel while I take my statin",
    "does my magnesium supplement help me sleep",
    // "skip" alone is ordinary English about things that aren't medicine.
    "I skip breakfast on busy days",
    "skipping my morning walk makes my code buggier",
  ])("lets through: %s", (text) => {
    expect(medicationIntent(text)).toBe(false);
  });

  test("is case and punctuation insensitive", () => {
    expect(medicationIntent("STOP TAKING MY PILLS.")).toBe(true);
    expect(medicationIntent("stop  taking   my  pills")).toBe(true);
  });

  test("says nothing about empty input", () => {
    expect(medicationIntent("")).toBe(false);
    expect(medicationIntent("   ")).toBe(false);
  });
});
