import { defineConfig } from "vitest/config";
import { EvalScoreReporter } from "./evals/eval-reporter.js";

export default defineConfig({
  test: {
    include: ["evals/**/*.test.ts"],
    reporters: ["default", new EvalScoreReporter()],
    setupFiles: ["@mastra/evals/vitest/setup", "./evals/setup.ts"],
    // Agent runs are slow: generous timeouts, no file parallelism so
    // LLM traffic stays sequential (rate limits multiply otherwise).
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
