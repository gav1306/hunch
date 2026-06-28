import { expect, test } from "vitest";
import { mastra } from "@/mastra";

test("mastra instance constructs with the Phase 3 agents registered", () => {
  expect(mastra).toBeDefined();
  expect(mastra.getAgentById("hypothesis-coach")).toBeDefined();
  expect(mastra.getAgentById("protocol-designer")).toBeDefined();
  expect(mastra.getAgentById("safety-reviewer")).toBeDefined();
});
