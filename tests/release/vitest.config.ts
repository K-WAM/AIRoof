import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    setupFiles: [
      path.resolve(__dirname, "../../src/test-utils/setup.ts"),
    ],
    include: ["tests/release/**/*.test.ts"],
    fileParallelism: false,
    maxConcurrency: 1,
    retry: 0,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    sequence: {
      concurrent: false,
    },
  },
});
