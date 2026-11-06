// Logs in once per seeded account through the REAL login form and saves the browser session
// (cookies + Firebase's IndexedDB) to e2e/.auth/<account>.json. Specs then start already signed in.
import { chromium, type Browser } from "@playwright/test";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNTS, APP_URL, PASSWORD } from "../scripts/e2e/config.cjs";
import { assertHarnessUp } from "../scripts/e2e/lib.cjs";

export const AUTH_DIR = join(__dirname, ".auth");
// A saved session's `__session` cookie is a Firebase ID token that dies after one hour. The full suite now runs longer
// than that (2026-11-05: 1.5 h, and every phone/iPhone spec after the hour mark was bounced to /login), so the `as()`
// fixture re-signs-in any account whose saved session is older than this.
export const AUTH_MAX_AGE_MS = 40 * 60_000;

export default async function globalSetup() {
  await assertHarnessUp();
  mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chromium" });
  for (const key of Object.keys(ACCOUNTS)) await signInAndSave(browser, key);
  await browser.close();
}

/** The saved-session file for an account, signing in again first when it is close to expiring. */
export async function freshAuthFile(key: string): Promise<string> {
  const file = join(AUTH_DIR, `${key}.json`);
  let age = Number.POSITIVE_INFINITY;
  try { age = Date.now() - statSync(file).mtimeMs; } catch { /* missing: sign in */ }
  if (age > AUTH_MAX_AGE_MS) {
    mkdirSync(AUTH_DIR, { recursive: true });
    const browser = await chromium.launch({ channel: "chromium" });
    try { await signInAndSave(browser, key); } finally { await browser.close(); }
  }
  return file;
}

async function signInAndSave(browser: Browser, key: string) {
  const account = ACCOUNTS[key as keyof typeof ACCOUNTS];
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

async function expectRealSession(context: import("@playwright/test").BrowserContext, key: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const session = (await context.cookies()).find((c) => c.name === "__session");
    if (session && session.value.length > 1) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`"${key}" signed in but never received a real session token (still the /login placeholder).`);
}
