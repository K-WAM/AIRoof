import { defineConfig } from "vitest/config";

// Firestore security-rules tests (T-170). They need the Firestore emulator loaded with firestore.rules (config: firebase.rules-test.json), so they
// never run in the normal `vitest run` (which only includes src/**). Run with `npm run test:rules`.
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
