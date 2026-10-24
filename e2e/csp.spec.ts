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
    const unstamped = await page.locator("script:not([nonce])").count();
    expect(unstamped, "every server-rendered script carries the nonce").toBe(0);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expectHealthy(page);
  });
}
