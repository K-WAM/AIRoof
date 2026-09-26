// Browser smoke tests against the LOCAL harness (never production). See docs/SMOKE-HARNESS.md.
//   npm run e2e:up:bg     start emulators + app (once)
//   npm run e2e:test      run every spec on desktop (1280) and phone (375)
//   npx playwright test e2e/smoke.spec.ts --project=phone
// Screenshots land in test-results/screens/<project>/ — open them to check spacing and layout.
import { defineConfig } from "@playwright/test";
import { APP_URL } from "./scripts/e2e/config.cjs";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // one shared local database; specs create their own data and do not clean up after each other
  retries: 1, // `next dev` can hiccup (recompile/restart); a real failure fails twice
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: APP_URL,
    channel: "chromium", // the full Chromium build (new headless mode); `npx playwright install chromium` provides it
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 60_000, // `next dev` compiles a page on first visit
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
