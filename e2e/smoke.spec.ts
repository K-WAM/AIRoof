// Every screen loads for the right person, without errors or sideways scroll, and industry gating holds.
// Screenshots: test-results/screens/<desktop|phone>/. Add a page here when you add a page.
import { expect, expectHealthy, overflowingElements, settle, shot, test, type Role } from "./fixtures";

// KNOWN UI BUGS found by this suite: pages whose content is wider than a 375 px phone screen. They do not fail the run, but
// they are printed in the report as "known-issue". When you fix one, DELETE its line — the test fails if a listed page no longer overflows.
const KNOWN_PHONE_OVERFLOW: Record<string, string> = {
  "/company/dashboard": "Needs-attention feed rows are wider than the screen",
  "/company/jobs": "Jobs table is wider than the screen (no card layout on phones)",
  "/company/settings": "A settings panel is wider than the screen",
  "/company/field": "Field screen content is wider than the screen",
  "/hub/guide": "Playbook page is wider than the screen",
  "/admin/invoices": "Invoice editor is wider than the screen",
  "/hub": "Demo Studio has a control wider than the screen",
  "/hub/demo": "Demo Studio has a control wider than the screen",
};

const COMPANY_PAGES = ["dashboard", "jobs", "pipeline", "calls", "calendar", "customers", "library", "team", "settings", "field", "guide"];

const SWEEP: Array<{ role: Role; label: string; paths: string[] }> = [
  { role: "owner", label: "roofing-owner", paths: COMPANY_PAGES.map((p) => `/company/${p}`) },
  { role: "viewer", label: "roofing-viewer", paths: ["/company/dashboard", "/company/jobs", "/company/pipeline", "/company/calls"] },
  { role: "dentalOwner", label: "dental-owner", paths: ["/company/dashboard", "/company/pipeline", "/company/calendar", "/company/calls", "/company/customers", "/company/settings"] },
  { role: "superadmin", label: "superadmin", paths: ["/hub", "/hub/demo", "/hub/onboarding", "/hub/guide", "/admin", "/admin/businesses", "/admin/businesses/e2e-roofing/config", "/admin/invoices", "/admin/usage", "/company/dashboard?preview=e2e-roofing"] },
];

for (const { role, label, paths } of SWEEP) {
  test.describe(`${label} pages`, () => {
    for (const path of paths) {
      test(`${path} loads clean`, async ({ as }) => {
        const page = await as(role);
        await page.goto(path);
        await settle(page);
        expect(new URL(page.url()).pathname, "was bounced to login").not.toContain("/login");
        await expect(page.locator("body")).not.toBeEmpty();
        await shot(page, `${label}${path.replace(/[/?=]/g, "_")}`);
        const known = test.info().project.name === "phone" ? KNOWN_PHONE_OVERFLOW[path.split("?")[0]] : undefined;
        if (known) {
          test.info().annotations.push({ type: "known-issue", description: `phone overflow: ${known}` });
          // Only the data-rich tenants are asked to still overflow (a nearly empty tenant may not show the bug).
          if (label === "roofing-owner" || label === "superadmin") expect((await overflowingElements(page)).length, `${path} no longer overflows on a phone — remove it from KNOWN_PHONE_OVERFLOW`).toBeGreaterThan(0);
        }
        await expectHealthy(page, { allowOverflow: Boolean(known) });
      });
    }
  });
}

test.describe("industry gating", () => {
  test("roofing shows Jobs, dental does not", async ({ as }) => {
    const roofing = await as("owner");
    await roofing.goto("/company/dashboard");
    await settle(roofing);
    await expect(roofing.getByRole("link", { name: /^Jobs$/ }).first()).toBeVisible();
    const dental = await as("dentalOwner");
    await dental.goto("/company/dashboard");
    await settle(dental);
    await expect(dental.getByRole("link", { name: /^Jobs$/ })).toHaveCount(0);
    await expect(dental.getByRole("link", { name: /Calendar/ }).first()).toBeVisible();
  });

  test("a client owner is not shown the admin shell", async ({ as }) => {
    const page = await as("owner");
    await page.goto("/admin/businesses");
    await settle(page);
    expect(new URL(page.url()).pathname).not.toBe("/admin/businesses");
  });

  test("feedback button is hidden for superadmin, shown for clients", async ({ as, isMobile }) => {
    test.skip(isMobile, "the desktop sidebar is what this checks");
    const sup = await as("superadmin");
    await sup.goto("/company/dashboard?preview=e2e-roofing");
    await settle(sup);
    await expect(sup.getByText(/^Feedback$/)).toHaveCount(0);
    const owner = await as("owner");
    await owner.goto("/company/dashboard");
    await settle(owner);
    await expect(owner.getByText(/Feedback/).first()).toBeVisible();
  });
});
