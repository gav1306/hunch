import { expect, test } from "vitest";
import { mastra } from "@/mastra";

test("mastra instance constructs with the hypothesis coach registered", () => {
  expect(mastra).toBeDefined();
  expect(mastra.getAgentById("hypothesis-coach")).toBeDefined();
});
