import { expect, expectHealthy, settle, shot, test } from "./fixtures";
import type { Page, TestInfo } from "@playwright/test";

// T-318 — the superadmin's "View as" projection, checked in the browser (desktop + phone).
// Screens: test-results/screens/<project>/view-as-*.png — read the phone ones by eye.
// This spec only touches the local smoke harness (scripts/e2e/config.cjs): e2e-roofing / e2e-superadmin.

const TENANT_NAME = "E2E Roofing Co";
const TENANT_ID = "e2e-roofing";

async function openViewAs(page: Page, userType: string) {
  const row = page.getByRole("row").filter({ hasText: TENANT_ID }).first();
  await row.getByRole("button", { name: "View as" }).click();
  const dialog = page.getByRole("dialog", { name: /View as/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: userType, exact: true }).click();
}

async function openMenu(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: /^(Open menu|Menu)$/ }).click();
}

test("View as Office staff is a read-only company view, and Exit returns to Clients", async ({ as }, testInfo) => {
  const page = await as("superadmin");
  await page.goto("/admin/businesses");
  await settle(page);
  await expect(page.getByRole("heading", { name: /Clients/ }).first()).toBeVisible();

  await openViewAs(page, "Office staff");
  await page.waitForURL(/\/company\/dashboard/);
  await settle(page);

  const banner = page.getByTestId("view-as-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Viewing as Office staff");
  await expect(banner).toContainText(TENANT_NAME);
  await expect(banner).toContainText("read-only");

  await openMenu(page, testInfo);
  // Office staff navigation, not the platform one: no Team tab and no Feedback button in a view-as session.
  const nav = page.getByRole("navigation", { name: "Company navigation" }).first();
  await expect(nav.getByRole("link", { name: "Dashboard" }).first()).toBeAttached();
  await expect(page.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /feedback/i })).toHaveCount(0);
  await expect(page.locator(".user-role-badge").first()).toHaveText("Office staff");
  await expectHealthy(page);
  await shot(page, "view-as-office");

  // A real write path: Settings' Save reaches the server and is refused with the read-only message.
  await page.goto("/company/settings");
  await settle(page);
  await page.getByRole("button", { name: /Save Changes/i }).click();
  // Scoped: Next.js's hidden route announcer is also role="alert".
  await expect(page.getByRole("alert").filter({ hasText: "View as is read-only" })).toContainText("View as is read-only. Exit to make changes.");
  await shot(page, "view-as-office-readonly");

  await banner.getByRole("button", { name: "Exit" }).click();
  await page.waitForURL(/\/admin\/businesses$/);
  await expect(page.getByRole("heading", { name: /Clients/ }).first()).toBeVisible();
  await expectHealthy(page);
});

test("View as Field crew lands on the field screen", async ({ as }) => {
  const page = await as("superadmin");
  await page.goto("/admin/businesses");
  await settle(page);

  await openViewAs(page, "Field crew");
  await page.waitForURL(/\/company\/field/);
  await settle(page);
  await expect(page.getByTestId("view-as-banner")).toContainText("Viewing as Field crew");
  await expectHealthy(page);
  await shot(page, "view-as-field-crew");

  await page.getByTestId("view-as-banner").getByRole("button", { name: "Exit" }).click();
  await page.waitForURL(/\/admin\/businesses$/);
});
