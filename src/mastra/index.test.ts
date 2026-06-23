import { expect, test } from "vitest";
import { mastra } from "@/mastra";

test("mastra instance constructs", () => {
  expect(mastra).toBeDefined();
  expect(typeof mastra.listAgents).toBe("function");
  expect(mastra.listAgents()).toEqual({});
});
