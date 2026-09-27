// Logs in once per seeded account through the REAL login form and saves the browser session
// (cookies + Firebase's IndexedDB) to e2e/.auth/<account>.json. Specs then start already signed in.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNTS, APP_URL, PASSWORD } from "../scripts/e2e/config.cjs";
import { assertHarnessUp } from "../scripts/e2e/lib.cjs";

export const AUTH_DIR = join(__dirname, ".auth");

export default async function globalSetup() {
  await assertHarnessUp();
  mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chromium" });
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    const context = await browser.newContext({ baseURL: APP_URL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.waitForLoadState("networkidle"); // let React hydrate, or the submit is swallowed
    await page.getByPlaceholder("Email").fill(account.email);
    await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 });
    } catch {
      throw new Error(`Login failed for "${key}" (${account.email}). Is the harness seeded? Try: npm run e2e:seed. Page said: ${(await page.locator("body").innerText()).slice(0, 200)}`);
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await context.storageState({ path: join(AUTH_DIR, `${key}.json`), indexedDB: true });
    await context.close();
  }
  await browser.close();
}
