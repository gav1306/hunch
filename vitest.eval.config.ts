import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Eval suite: live-model quality checks (RESEARCH §5). Run with
 * `npm run test:eval`. Loads .env so the provider key (OPENROUTER_API_KEY, or
 * NVIDIA_API_KEY with LLM_PROVIDER=nvidia) is available; evals
 * self-skip when the key is absent (e.g. in CI).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.eval.test.ts"],
    setupFiles: ["dotenv/config"],
    // Live model calls are slow; give them room.
    testTimeout: 60_000,
  },
});
