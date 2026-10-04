// Screen audit: every roofing screen, as each role that uses it — time to first content, API calls made while
// loading, API bytes, horizontal overflow, and a screenshot per screen. The second visit is the one measured
// (`next dev` compiles a page on its first visit). Budgets are deliberately loose for dev mode; production is faster.
//   npx playwright test e2e/screen-audit.spec.ts
// Report: test-results/screens/<project>/audit-*.png + the table printed to stdout.
import { test, expect, settle, shot, overflowingElements, type Role } from "./fixtures";

const SCREENS: Array<{ role: Role; path: string; name: string }> = [
  { role: "owner", path: "/company/dashboard", name: "dashboard" },
  { role: "owner", path: "/company/calls", name: "calls" },
  { role: "owner", path: "/company/pipeline", name: "pipeline" },
  { role: "owner", path: "/company/calendar", name: "calendar" },
  { role: "owner", path: "/company/jobs", name: "jobs" },
  { role: "owner", path: "/company/jobs/J-1000", name: "job-detail" },
  { role: "owner", path: "/company/field", name: "field" },
  { role: "owner", path: "/company/customers", name: "customers" },
  { role: "owner", path: "/company/library", name: "library" },
  { role: "owner", path: "/company/team", name: "team" },
  { role: "owner", path: "/company/settings", name: "settings" },
  { role: "owner", path: "/company/guide", name: "guide" },
  { role: "fieldCrew", path: "/company/field", name: "field-crew" },
  { role: "viewer", path: "/company/dashboard", name: "dashboard-viewer" },
  { role: "superadmin", path: "/admin/businesses", name: "admin-businesses" },
  { role: "superadmin", path: "/hub/demo", name: "hub-demo" },
];

/** Budget for the measured (warm) visit: first non-skeleton content, and API calls fired while loading. */
const FIRST_CONTENT_MS = 5_000;
const MAX_API_CALLS = 12;
/** T-186 clutter guard, phone only, at the seeded 30+ rows. Loose on purpose: it catches the 14,000 px regressions,
 *  the eye still judges the rest. Settings/Guide/Demo Studio are long reading pages with a sticky switcher. */
const PHONE_HEIGHT_BUDGET = 4_000;
const LONG_BY_DESIGN = new Set(["settings", "guide", "hub-demo"]);
const MAX_TAPS_ABOVE_FOLD = 16;

/** C2/C4/C10 numbers (docs/SCREEN-CLARITY-HEURISTICS.md): page height, visible teal buttons and tap targets above the fold. */
async function clutterMetrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && r.top < vh && r.bottom > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const primaryAboveFold = [...document.querySelectorAll(".button.primary")].filter(visible).length;
    const interactiveAboveFold = [...document.querySelectorAll("main a[href], main button, main select, main input:not([type=hidden]), main textarea, main summary")]
      .filter(visible).length;
    return { height: document.documentElement.scrollHeight, primaryAboveFold, interactiveAboveFold };
  });
}

test.describe.configure({ mode: "serial" });

test("every screen renders fast, without overflow or errors", async ({ as }, info) => {
  test.setTimeout(15 * 60_000);
  const rows: string[] = [];
  const failures: string[] = [];
  for (const s of SCREENS) {
    const page = await as(s.role);
    await page.goto(s.path); await settle(page, 300); // warm-up compile
    const api: Array<{ url: string; bytes: number }> = [];
    page.on("response", async (r) => {
      const u = new URL(r.url());
      if (!u.pathname.startsWith("/api/")) return;
      const len = Number(r.headers()["content-length"] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
      api.push({ url: (u.pathname + u.search).replace(/\d{10,}/g, "<t>"), bytes: len }); // a timestamp in the query is the same request
    });
    // Two measured visits, keep the faster: `next dev` stalls at random (route eviction + recompiles), and a screen
    // that is really slow is slow both times.
    let firstContent = Infinity;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1) api.length = 0;
      const t0 = Date.now();
      await page.goto(s.path);
      await page.locator("main, .company-main, body").first().waitFor();
      await page.waitForFunction(() => !document.querySelector(".skeleton-page"), null, { timeout: 20_000 }).catch(() => {});
      firstContent = Math.min(firstContent, Date.now() - t0);
      if (firstContent <= FIRST_CONTENT_MS) break;
    }
    await settle(page, 400);
    // Dev mode runs React StrictMode, which fires every mount effect twice — count distinct requests, not duplicates.
    const calls = new Set(api.map((a) => a.url)).size;
    const kb = Math.round(api.reduce((n, a) => n + a.bytes, 0) / 1024);
    const overflow = info.project.name === "phone" ? await overflowingElements(page) : [];
    const clutter = await clutterMetrics(page);
    await shot(page, `audit-${s.name}`);
    rows.push(`${s.name.padEnd(18)} ${String(firstContent).padStart(6)}ms ${String(calls).padStart(3)} api ${String(kb).padStart(5)}KB h=${clutter.height} primary=${clutter.primaryAboveFold} tapAboveFold=${clutter.interactiveAboveFold} ${overflow.length ? "OVERFLOW " + overflow.join(", ") : ""}`);
    if (firstContent > FIRST_CONTENT_MS) failures.push(`${s.name}: first content ${firstContent}ms > ${FIRST_CONTENT_MS}`);
    if (calls > MAX_API_CALLS) failures.push(`${s.name}: ${calls} API calls while loading > ${MAX_API_CALLS} (${api.map((a) => a.url.split("?")[0]).join(" ")})`);
    if (info.project.name === "phone") {
      const heightBudget = LONG_BY_DESIGN.has(s.name) ? 5_500 : PHONE_HEIGHT_BUDGET;
      if (clutter.height > heightBudget) failures.push(`${s.name}: phone page ${clutter.height}px > ${heightBudget}px — bound the list (C10)`);
      if (clutter.primaryAboveFold > 1) failures.push(`${s.name}: ${clutter.primaryAboveFold} teal buttons above the fold — one primary action (C2)`);
      if (clutter.interactiveAboveFold > MAX_TAPS_ABOVE_FOLD) failures.push(`${s.name}: ${clutter.interactiveAboveFold} tap targets above the fold > ${MAX_TAPS_ABOVE_FOLD} (C4)`);
    }
    if (overflow.length) failures.push(`${s.name}: horizontal overflow ${overflow.join(", ")}`);
    await page.close();
  }
  console.log(`\n[${info.project.name}] screen audit\n` + rows.join("\n"));
  expect(failures, failures.join("\n")).toEqual([]);
});
