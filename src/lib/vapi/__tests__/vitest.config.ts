import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../../..", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../..", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/lib/vapi/__tests__/**/*.test.ts"],
    root,
    restoreMocks: true,
  },
});
