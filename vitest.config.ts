import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // tsconfig.json's "jsx": "preserve" is correct for Next.js's own SWC build,
  // but Vite's transform (oxc by default in this Vite version) needs an
  // explicit JSX mode for .tsx test files (T-066's Tooltip test is the first
  // one) — this only affects the test pipeline, not `next build`/`tsc`.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    setupFiles: ["./src/test-utils/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
