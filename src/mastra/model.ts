import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Single source of truth for the LLM every Hunch agent runs on: Claude Sonnet 5
 * through OpenRouter.
 *
 * OpenRouter speaks the OpenAI wire format, so it needs no provider package of
 * its own — `@ai-sdk/openai-compatible` pointed at their base URL is the whole
 * integration. Credentials are one key in .env; there is no cloud account or
 * credential chain to configure.
 *
 * Mastra's string model router has no OpenRouter provider, so we build an AI SDK
 * model instance and hand it to each Agent rather than a `"provider/model"`
 * string.
 */

export const OPENROUTER_MODEL_ID =
  process.env.OPENROUTER_MODEL_ID ?? "anthropic/claude-sonnet-5";

const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  // OpenRouter honours `response_format: json_schema`, but the generic
  // OpenAI-compatible provider assumes it doesn't and falls back to asking for
  // JSON in the prompt — which returns objects missing required keys. Every
  // agent here parses a Zod schema, so the schema has to reach the API.
  supportsStructuredOutputs: true,
});

/** Claude Sonnet 5 — the model shared by every agent. */
export const claudeModel = openrouter(OPENROUTER_MODEL_ID);
