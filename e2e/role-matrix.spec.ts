// Read the rendered nav (fed by navModel), so new screens join the sweep automatically.
import { type Page } from "@playwright/test";
import { ACCOUNTS, expect, expectHealthy, shot, test, type Role } from "./fixtures";
import { visibleNavLinks } from "../src/app/company/navModel";
import { defaultLandingPath } from "../src/lib/team/landing";
import type { TeamRole, TradeTitle } from "../src/types/team";

async function navRoutes(page: Page): Promise<string[]> {
  if (new URL(page.url()).pathname.startsWith("/company/")) {
    // The first render intentionally fails open until the industry's bootstrap
    // resolves. Collect the actual tenant nav, not that brief fallback.
    await expect(page.locator(".company-shell")).toHaveAttribute("data-portal-family", /\S+/);
  }
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
    let previewDiscovered = false;
    for (const route of routes) {
      await test.step(route, async () => {
        await page.goto(route);
        await expect(page.getByRole("heading").first()).toBeVisible();
        await expect(page.getByText(/Failed to load this page|This page couldn.t load/)).toHaveCount(0);
        const member = ACCOUNTS[role] as { role?: TeamRole; trade?: TradeTitle };
        const destination = route === "/company/dashboard" && role !== "superadmin"
          ? defaultLandingPath(member, role === "dentalOwner" ? ["jobs"] : []) : new URL(route, page.url()).pathname;
        expect(new URL(page.url()).pathname).toBe(destination);
        await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
        if (role === "viewer") {
          await expect(page.getByRole("button", { name: /^(New Job|Create job|Delete|Confirm & send|Send invoice|Send report|Save changes)$/i })).toHaveCount(0);
          await expect(page.getByRole("button", { name: /^(?:✓\s*)?Confirm\b|^Move back to/ })).toHaveCount(0);
          await expect(page.getByText("Payment settings couldn't be loaded.", { exact: true })).toHaveCount(0);
        }
        await expectHealthy(page);
        await shot(page, `matrix-${role}-${route}`);
        if (role === "superadmin" && route.includes("preview=") && !previewDiscovered) {
          previewDiscovered = true;
          for (const link of await navRoutes(page)) if (!routes.includes(link)) routes.push(link);
        }
      });
    }

    const officeRoutes = visibleNavLinks({ role: "owner", isEnabled: () => true }).map((link) => link.path).filter((path) => path.startsWith("/"));
    const denied = role === "superadmin" ? [] : officeRoutes.filter((path) => !routes.includes(path));
    if (role !== "superadmin") {
      const admin = await as("superadmin");
      await admin.goto("/hub");
      await expect(admin.locator("nav").first()).toBeAttached();
      denied.push(...(await navRoutes(admin)).filter((path) => /^\/(admin|hub)(\/|$)/.test(path)), "/hub");
      await admin.close();
    }
    for (const route of denied) {
      await page.goto(route);
      if (route === "/company/team" && role !== "fieldCrew") {
        await expect(page.getByText("Only an admin can manage the team.", { exact: true })).toBeVisible();
        await expect(page.locator(".team-member-card")).toHaveCount(0);
        await expect(page.getByRole("button", { name: /Invite|Change role|Disable/ })).toHaveCount(0);
      } else {
        await expect.poll(() => new URL(page.url()).pathname, { message: `${role} must be redirected from ${route}` }).not.toBe(route);
        await expect(page.getByRole("heading").first()).toBeVisible();
      }
      // Don't cancel the Field screen's just-started jobs/timeclock reads by
      // immediately typing the next forbidden URL. Real failures still fail health.
      await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
      await expectHealthy(page);
    }
  });
}
