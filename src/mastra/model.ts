import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Single source of truth for the LLMs Hunch agents run on, through OpenRouter:
 * Claude Sonnet 5 for every agent that writes, Haiku 4.5 for memory recall.
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

/** Claude Sonnet 5 — the default for every agent. */
export const claudeModel = openrouter(OPENROUTER_MODEL_ID);

export const OPENROUTER_FAST_MODEL_ID =
  process.env.OPENROUTER_FAST_MODEL_ID ?? "anthropic/claude-haiku-4.5";

/**
 * Claude Haiku 4.5 — for short picking jobs where Sonnet's floor is most of the
 * wait. Memory recall returns ~40 tokens yet took ~2.5s on Sonnet, on every
 * returning user's first request. Moved only after its eval passed on both.
 */
export const fastModel = openrouter(OPENROUTER_FAST_MODEL_ID);
