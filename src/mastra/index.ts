import { Mastra } from "@mastra/core";
import { hypothesisCoach } from "@/mastra/agents/hypothesis-coach";
import { protocolDesigner } from "@/mastra/agents/protocol-designer";
import { safetyReviewer } from "@/mastra/agents/safety-reviewer";
import { analyst } from "@/mastra/agents/analyst";
import { memory } from "@/mastra/agents/memory";

/**
 * Root Mastra instance for Hunch.
 *
 * Agents (Hypothesis Coach, Protocol Designer, Safety Reviewer,
 * Adherence Companion, Analyst) and workflows are registered here as
 * vertical slices land.
 */
export const mastra = new Mastra({
  agents: { hypothesisCoach, protocolDesigner, safetyReviewer, analyst, memory },
});
