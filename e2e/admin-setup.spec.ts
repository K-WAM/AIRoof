import { test, expect, settle, shot, expectHealthy } from "./fixtures";

// Owner, 2026-09-28: check "users, admin view, company setup, navigability". Every superadmin screen and the company's
// own setup screens open without an error, fit the phone, and leave a screenshot to read by eye
// (test-results/screens/<desktop|phone>/admin-*.png, setup-*.png).

const ADMIN_SCREENS: Array<[string, string, RegExp]> = [
  ["admin-clients", "/admin/businesses", /Clients|Businesses/i],
  ["admin-client-config", "/admin/businesses/e2e-roofing/config", /E2E Roofing|Config/i],
  ["admin-usage", "/admin/usage", /Usage/i],
  ["admin-invoices", "/admin/invoices", /Invoice/i],
  ["hub-onboarding", "/hub/onboarding", /Onboard|business/i],
  ["hub-demo-studio", "/hub/demo", /Demo/i],
  ["hub-playbooks", "/hub/guide", /Playbook|Demo/i],
];

for (const [name, path, heading] of ADMIN_SCREENS) {
  test(`superadmin: ${name} opens cleanly`, async ({ as }) => {
    const page = await as("superadmin");
    await page.goto(path);
    await settle(page);
    expect(new URL(page.url()).pathname, "not bounced to sign-in").toBe(path);
    await expect(page.getByRole("heading").filter({ hasText: heading }).first()).toBeVisible();
    await expectHealthy(page, { allowOverflow: true });
    await shot(page, name);
  });
}

const SETUP_SCREENS: Array<[string, string, RegExp]> = [
  ["setup-settings", "/company/settings", /Settings/i],
  ["setup-team", "/company/team", /Team/i],
  ["setup-library-pricing", "/company/library?section=pricing", /Library/i],
  ["setup-library-crews", "/company/library?section=crews", /Library/i],
  ["setup-customers", "/company/customers", /Customers|Clients/i],
];

for (const [name, path, heading] of SETUP_SCREENS) {
  test(`company owner: ${name} opens cleanly`, async ({ as }) => {
    const page = await as("owner");
    await page.goto(path);
    await settle(page);
    await expect(page.getByRole("heading", { level: 1 }).filter({ hasText: heading }).first()).toBeVisible();
    await expectHealthy(page, { allowOverflow: path.includes("team") });
    await shot(page, name);
  });
}

test("an old Library → Customers link lands on the Customers page (one screen per job)", async ({ as }) => {
  const page = await as("owner");
  await page.goto("/company/library?section=customers");
  await page.waitForURL(/\/company\/customers/);
  await page.goto("/company/library");
  await settle(page);
  await expect(page.getByRole("button", { name: /^Pricing/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Customers|Clients) \(/ })).toHaveCount(0);
});
