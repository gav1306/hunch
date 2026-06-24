import { Mastra } from "@mastra/core";
import { hypothesisCoach } from "@/mastra/agents/hypothesis-coach";

/**
 * Root Mastra instance for Hunch.
 *
 * Agents (Hypothesis Coach, Protocol Designer, Safety Reviewer,
 * Adherence Companion, Analyst) and workflows are registered here as
 * vertical slices land.
 */
export const mastra = new Mastra({
  agents: { hypothesisCoach },
});
