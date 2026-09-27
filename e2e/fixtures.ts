// Shared Playwright helpers. Import { test, expect } from "./fixtures" in every spec.
//
//   test("owner sees the dashboard", async ({ as }) => {
//     const page = await as("owner");                 // already signed in (see global-setup.ts)
//     await page.goto("/company/dashboard");
//     await settle(page); await expectHealthy(page); await shot(page, "dashboard");
//   });
//
// Accounts (password E2e-Passw0rd!): owner, staff, crew, viewer (roofing tenant e2e-roofing) · dentalOwner (e2e-dental) · superadmin.
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNTS, APP_URL } from "../scripts/e2e/config.cjs";

export type Role = keyof typeof ACCOUNTS;
export { expect, ACCOUNTS };

const problems = new WeakMap<Page, string[]>();

// Noise that is not an app bug: dev-server chatter and the browser's own favicon probe.
const IGNORED_CONSOLE = [/favicon/i, /Download the React DevTools/i, /\[Fast Refresh\]/i, /webpack-hmr/i, /Failed to load resource/i]  // the failing URL is reported by the response listener below;

export const test = base.extend<{ as: (role: Role) => Promise<Page> }>({
  as: async ({ browser }, run, testInfo) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await run(async (role) => {
      const u = testInfo.project.use;
      const context = await browser.newContext({
        baseURL: APP_URL,
        storageState: join(__dirname, ".auth", `${role}.json`),
        viewport: u.viewport ?? { width: 1280, height: 800 },
        isMobile: u.isMobile, hasTouch: u.hasTouch, deviceScaleFactor: u.deviceScaleFactor,
      });
      contexts.push(context);
      const page = await context.newPage();
      const seen: string[] = [];
      problems.set(page, seen);
      page.on("pageerror", (e) => seen.push(`uncaught: ${e.message}`));
      page.on("response", (r) => {
        const status = r.status();
        const url = new URL(r.url());
        if (url.origin !== APP_URL) return;
        if (status === 503 && /^\/api\/calls\/[^/]+\/audio$/.test(url.pathname)) return; // no ElevenLabs key locally, so no recordings
        if (status >= 500 || (status === 404 && url.pathname.startsWith("/api/"))) seen.push(`HTTP ${status} ${r.request().method()} ${url.pathname}`);
      });
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const text = m.text();
        if (!IGNORED_CONSOLE.some((re) => re.test(text))) seen.push(`console.error: ${text.slice(0, 300)}`);
      });
      return page;
    });
    for (const c of contexts) await c.close();
  },
});

/** Wait for the page to go quiet (data fetched, dev compile done). Never throws: some pages poll. */
export async function settle(page: Page, ms = 600) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

/** Elements that stick out past the right edge of the viewport (the classic mobile layout bug). */
export async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.position === "fixed" || style.visibility === "hidden") continue;
      // Skip anything inside a horizontally scrollable region (tables, tab strips) — that scroll is intentional.
      let p: Element | null = el.parentElement, scrollable = false;
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { scrollable = true; break; } p = p.parentElement; }
      if (!scrollable && r.right > vw + 1) out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} (right=${Math.round(r.right)} > ${vw})`);
      if (out.length >= 8) break;
    }
    return out;
  });
}

/** Fails on: uncaught JS errors, console errors, the Next error overlay / crash text, and horizontal overflow. */
export async function expectHealthy(page: Page, { allowOverflow = false } = {}) {
  const crash = (await page.locator("[data-nextjs-dialog], [data-nextjs-dialog-overlay]").count()) + (await page.getByText(/Application error|Unhandled Runtime Error|This page couldn.t load/i).count());
  expect(crash, "Next.js error overlay / crash page is showing").toBe(0);
  expect(problems.get(page) ?? [], "browser errors while loading").toEqual([]);
  if (!allowOverflow) expect(await overflowingElements(page), "content wider than the viewport").toEqual([]);
}

/** Full-page screenshot into test-results/screens/<project>/<name>.png — open it to check spacing by eye. */
export async function shot(page: Page, name: string, testInfo: TestInfo = test.info()) {
  const dir = join("test-results", "screens", testInfo.project.name);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name.replace(/[^a-z0-9._-]+/gi, "-")}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}
