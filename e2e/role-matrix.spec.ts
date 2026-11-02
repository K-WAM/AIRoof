// Read the rendered nav (fed by navModel), so new screens join the sweep automatically.
import { type Page } from "@playwright/test";
import { ACCOUNTS, expect, expectHealthy, shot, test, type Role } from "./fixtures";
import { visibleNavLinks } from "../src/app/company/navModel";
import { defaultLandingPath } from "../src/lib/team/landing";
import type { TeamRole, TradeTitle } from "../src/types/team";

async function navRoutes(page: Page): Promise<string[]> {
  const menu = page.getByRole("button", { name: /^(Open menu|Menu)$/ });
  if (await menu.isVisible()) await menu.click();
  const routes = await page.locator("nav a[href]").evaluateAll((links) =>
    [...new Set(links.map((link) => link.getAttribute("href")!).filter((href) => /^\/(company|admin|hub)(\/|$)/.test(href)))],
  );
  const close = page.getByRole("button", { name: "Close", exact: true });
  if (await close.isVisible()) await close.click();
  return routes;
}

for (const role of Object.keys(ACCOUNTS) as Role[]) {
  test(`${role}: every navigation screen and denied routes`, async ({ as }) => {
    test.setTimeout(240_000);
    const page = await as(role);
    await page.goto(role === "superadmin" ? "/hub" : role === "crew" || role === "fieldCrew" ? "/company/field" : "/company/dashboard");
    await expect(page.locator("nav").first()).toBeAttached();
    const routes = await navRoutes(page);
    if (role === "viewer") {
      const refused = await page.request.put("/api/company/settings", { data: { businessId: "e2e-roofing", contactEmail: "forbidden@example.test" } });
      expect(refused.status(), "viewer settings writes must be refused by the server").toBe(403);
    }
    expect(routes.length, "navigation must load before checking permissions").toBeGreaterThan(0);
    for (const route of routes) {
      await test.step(route, async () => {
        await page.goto(route);
        await expect(page.getByRole("heading").first()).toBeVisible();
        await expect(page.getByText(/Failed to load this page|This page couldn.t load/)).toHaveCount(0);
        const member = ACCOUNTS[role] as { role?: TeamRole; trade?: TradeTitle };
        const destination = route === "/company/dashboard" && role !== "superadmin"
          ? defaultLandingPath(member, role === "dentalOwner" ? ["jobs"] : []) : new URL(route, page.url()).pathname;
        expect(new URL(page.url()).pathname).toBe(destination);
        if (role === "viewer") {
          await expect(page.getByRole("button", { name: /^(New Job|Create job|Delete|Confirm & send|Send invoice|Send report|Save changes)$/i })).toHaveCount(0);
        }
        await expectHealthy(page);
        await shot(page, `matrix-${role}-${route}`);
      });
    }

    const officeRoutes = visibleNavLinks({ role: "owner", isEnabled: () => true }).map((link) => link.path).filter((path) => path.startsWith("/"));
    const denied = role === "fieldCrew" ? officeRoutes.filter((path) => !routes.includes(path))
      : role === "dentalOwner" ? ["/company/jobs", "/company/field"] : [];
    if (role !== "superadmin") denied.push("/admin/businesses", "/hub");
    for (const route of denied) {
      await page.goto(route);
      await expect.poll(() => new URL(page.url()).pathname, { message: `${role} must be redirected from ${route}` }).not.toBe(route);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expectHealthy(page);
    }
  });
}
