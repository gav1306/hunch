import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Agent } from "@mastra/core/agent";

/**
 * Single source of truth for the LLMs Hunch agents run on.
 *
 * Two providers, both speaking the OpenAI wire format, so `@ai-sdk/openai-
 * compatible` pointed at a base URL is the whole integration and switching is
 * an env change, never a code change:
 *
 *   - `openrouter` (default): Claude Sonnet 5 for every agent that writes,
 *     Haiku 4.5 for memory recall. Every prompt and eval was tuned here.
 *   - `nvidia` (`LLM_PROVIDER=nvidia`, key in `NVIDIA_API_KEY`): NVIDIA's hosted
 *     endpoint, Nemotron 3 Super for both. Added as a fallback when the
 *     OpenRouter key died. Probed on 2026-10-04: it was the only large model on
 *     the free tier that answered at all (Kimi K3, GLM 5.3 and DeepSeek V4.1
 *     timed out at 90s), and it honours `json_schema` with thinking off.
 *
 * `LLM_MODEL_ID` / `LLM_FAST_MODEL_ID` override either provider's defaults
 * (`OPENROUTER_MODEL_ID` / `OPENROUTER_FAST_MODEL_ID` still work on OpenRouter).
 *
 * Mastra's string model router has neither provider, so we build an AI SDK
 * model instance and hand it to each Agent rather than a `"provider/model"`
 * string.
 */

type Provider = {
  name: string;
  baseURL: string;
  apiKey: string | undefined;
  model: string;
  fastModel: string;
  /**
   * Request-body fields that turn the model's extended thinking off. Each
   * provider spells it its own way, and neither has a typed setting in the
   * generic provider, so it is written onto the request.
   */
  noThinking: Record<string, unknown>;
};

const PROVIDERS: Record<"openrouter" | "nvidia", () => Provider> = {
  openrouter: () => ({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL_ID || "anthropic/claude-sonnet-5",
    fastModel: process.env.OPENROUTER_FAST_MODEL_ID || "anthropic/claude-haiku-4.5",
    noThinking: { reasoning: { enabled: false } },
  }),
  nvidia: () => ({
    name: "nvidia",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: process.env.NVIDIA_API_KEY,
    model: "nvidia/nemotron-3-super-120b-a12b",
    fastModel: "nvidia/nemotron-3-super-120b-a12b",
    noThinking: { chat_template_kwargs: { enable_thinking: false } },
  }),
};

const chosenName = process.env.LLM_PROVIDER === "nvidia" ? "nvidia" : "openrouter";
const provider = PROVIDERS[chosenName]();

/**
 * The other provider, when its key is set. A 5xx, 429 or outage on the chosen
 * one used to go straight to the user as "try again"; with both keys present,
 * every agent falls through to the other provider instead (Mastra's model
 * fallback list). With one key, nothing changes.
 */
const backup = (() => {
  const other = PROVIDERS[chosenName === "nvidia" ? "openrouter" : "nvidia"]();
  return other.apiKey ? other : null;
})();

/** The model id every writing agent runs on, after any override. */
// `||`, not `??`: an empty override (LLM_MODEL_ID="", as .env.example shows)
// means unset, not "send an empty model name".
export const MODEL_ID = process.env.LLM_MODEL_ID || provider.model;
export const FAST_MODEL_ID = process.env.LLM_FAST_MODEL_ID || provider.fastModel;

/** Whether the chosen provider has a key at all. The `.eval` tests skip without one. */
export const hasLlmKey = Boolean(provider.apiKey);

function makeProvider(
  p: Provider,
  transformRequestBody?: (args: Record<string, unknown>) => Record<string, unknown>,
) {
  return createOpenAICompatible({
    name: p.name,
    baseURL: p.baseURL,
    apiKey: p.apiKey ?? "",
    // Both providers honour `response_format: json_schema`, but the generic
    // OpenAI-compatible provider assumes they don't and falls back to asking for
    // JSON in the prompt — which returns objects missing required keys. Every
    // agent here parses a Zod schema, so the schema has to reach the API.
    supportsStructuredOutputs: true,
    transformRequestBody,
  });
}

type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

/**
 * One role's model: the chosen provider's, then the backup's if there is one.
 * `pick` names the model id on a given provider, and `thinkingOff` builds that
 * provider's own way of switching extended thinking off.
 */
function withFallback(
  pick: (p: Provider, chosen: boolean) => string,
  thinkingOff = false,
): AgentModel {
  const build = (p: Provider, chosen: boolean) =>
    makeProvider(p, thinkingOff ? (args) => ({ ...args, ...p.noThinking }) : undefined)(
      pick(p, chosen),
    );
  const primary = build(provider, true);
  if (!backup) return primary;
  return [
    { model: primary, maxRetries: 0 },
    { model: build(backup, false), maxRetries: 0 },
  ];
}

/** The default model for every agent (Claude Sonnet 5 on OpenRouter). */
export const claudeModel = withFallback((p, chosen) => (chosen ? MODEL_ID : p.model));

/**
 * The same model with the provider's extended thinking turned off.
 *
 * Measured against the live API on 2026-09-21, same prompt and schema, three
 * runs each way: with thinking on, the whole hypothesis is emitted in 1-60ms at
 * the very end of a 6.9-10.1s wait — there is nothing to stream, so the user
 * watches a blank button and then sees a finished object. With it off the wait
 * falls to about 3s and its last second is the object arriving in pieces.
 * Nemotron on NVIDIA showed the same shape on 2026-10-04: 6.6-9.2s on, under
 * 1.5s off.
 *
 * Scoped deliberately: the Hypothesis Coach is the one agent whose output a
 * person sits and watches being written. Every other agent keeps `claudeModel`
 * and its thinking — they answer into a page that is already on screen.
 */
export const claudeModelNoThinking = withFallback(
  (p, chosen) => (chosen ? MODEL_ID : p.model),
  true,
);

/**
 * For short picking jobs where the main model's floor is most of the wait
 * (Claude Haiku 4.5 on OpenRouter). Memory recall returns ~40 tokens yet took
 * ~2.5s on Sonnet, on every returning user's first request. Moved only after
 * its eval passed on both.
 */
export const fastModel = withFallback((p, chosen) => (chosen ? FAST_MODEL_ID : p.fastModel));
