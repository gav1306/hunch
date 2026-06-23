import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Evals hit the live model — run them via `npm run test:eval`, not the
    // deterministic CI gate.
    exclude: [...configDefaults.exclude, "src/**/*.eval.test.ts"],
  },
});
