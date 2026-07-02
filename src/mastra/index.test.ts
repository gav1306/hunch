import { expect, test } from "vitest";
import { mastra } from "@/mastra";

test("mastra instance constructs with the registered agents", () => {
  expect(mastra).toBeDefined();
  expect(mastra.getAgentById("hypothesis-coach")).toBeDefined();
  expect(mastra.getAgentById("protocol-designer")).toBeDefined();
  expect(mastra.getAgentById("safety-reviewer")).toBeDefined();
  expect(mastra.getAgentById("analyst")).toBeDefined();
});
