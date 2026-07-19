import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

/**
 * Single source of truth for the LLM every Hunch agent runs on: Claude Sonnet 5
 * on Amazon Bedrock.
 *
 * Mastra's string model router has no Bedrock provider, so we build an AI SDK
 * Bedrock model instance and hand it to each Agent instead of a `"provider/model"`
 * string.
 *
 * Credentials resolve through the standard AWS provider chain
 * (`fromNodeProviderChain`): a named profile via `AWS_PROFILE` for local dev
 * (keeping secrets in ~/.aws, not .env), then `AWS_ACCESS_KEY_ID` /
 * `AWS_SECRET_ACCESS_KEY` env vars or an attached IAM role in CI/prod — no code
 * change between environments. Region comes from `AWS_REGION`.
 *
 * The model id is an inference-profile id (`us.anthropic.claude-sonnet-5`);
 * Bedrock rejects the bare on-demand id for this model.
 */
const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION ?? "us-west-2",
  credentialProvider: fromNodeProviderChain(),
});

export const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-5";

/** Claude Sonnet 5 on Bedrock — the model shared by every agent. */
export const claudeModel = bedrock(BEDROCK_MODEL_ID);
