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
    // /login writes a placeholder `__session=1`; AuthProvider swaps in the real ID token a moment later. Saving the
    // placeholder made every spec using that account fail as "Invalid session" (401) — wait for the real token.
    await expectRealSession(context, key);
    await context.storageState({ path: join(AUTH_DIR, `${key}.json`), indexedDB: true });
    await context.close();
  }
  await browser.close();
}

async function expectRealSession(context: import("@playwright/test").BrowserContext, key: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const session = (await context.cookies()).find((c) => c.name === "__session");
    if (session && session.value.length > 1) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`"${key}" signed in but never received a real session token (still the /login placeholder).`);
}
