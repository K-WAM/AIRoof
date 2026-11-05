import { expect, expectHealthy, test } from "./fixtures";

// 2026-10-23 security review: pages carry a per-request script nonce instead of 'unsafe-inline' (src/lib/http/csp.ts).
// A blocked script shows up as a console error, which expectHealthy fails on — so these pages also prove nothing the
// app needs is being refused.
const PAGES: Array<{ role: "owner" | "superadmin" | "crew"; path: string }> = [
  { role: "owner", path: "/login" },
  { role: "owner", path: "/demo" },
  { role: "owner", path: "/company/dashboard" },
  { role: "owner", path: "/company/jobs" },
  { role: "crew", path: "/company/field" },
  { role: "superadmin", path: "/admin/businesses" },
  { role: "superadmin", path: "/hub/demo" },
];

for (const { role, path } of PAGES) {
  test(`${path} (${role}) runs only nonce'd scripts`, async ({ as }) => {
    const page = await as(role);
    const response = await page.goto(path);
    const csp = response?.headers()["content-security-policy"] ?? "";
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src ")) ?? "";
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // Check the HTML the server actually sent. Counting the live DOM is racy: the browser later adds same-origin webpack
    // chunks (allowed by 'self') and, under `next dev` only, the dev-overlay host element — neither is server-rendered.
    const html = (await response?.text()) ?? "";
    const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
    expect(scriptTags.length, "the page server-renders its scripts").toBeGreaterThan(0);
    const unstamped = scriptTags.filter((tag) => !/\snonce=/.test(tag));
    expect(unstamped, "every server-rendered script carries the nonce").toEqual([]);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expectHealthy(page);
  });
}
