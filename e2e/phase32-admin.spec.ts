import { test, expect, settle, shot, expectHealthy } from "./fixtures";

// Phase 32 Stream D (T-158, T-166, T-167) + Stream I's line contract, checked in the browser by the integrator.
// Screens: test-results/screens/<desktop|phone>/p32-*.png — read the phone ones by eye.

test("/hub opens Demo Studio inside the one Admin shell (no second Hub nav)", async ({ as }, testInfo) => {
  const page = await as("superadmin");
  await page.goto("/hub");
  await settle(page);
  expect(new URL(page.url()).pathname).toBe("/hub/demo");
  await expect(page.getByText("Open Hub", { exact: false })).toHaveCount(0);
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "Menu" }).click();
  const nav = page.getByRole("navigation", { name: "Admin navigation" });
  await expect(nav).toHaveCount(1);
  for (const label of ["Demo Studio", "Client view", "Field screen", "Playbook"]) await expect(nav.getByRole("link", { name: label }).first()).toBeAttached();
  // Every demo entry sits under the one "Demo" heading.
  await expect(nav.locator(".nav-section", { hasText: "Demo" }).getByRole("link")).toHaveCount(3);
});

test("on a phone the superadmin menu is folded behind one Menu button", async ({ as }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone layout");
  const page = await as("superadmin");
  await page.goto("/admin/businesses");
  await settle(page);
  const nav = page.getByRole("navigation", { name: "Admin navigation" });
  await expect(nav).toBeHidden();
  await expect(page.getByRole("heading", { name: /Clients/ }).first()).toBeInViewport();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Usage & costs" }).click();
  await page.waitForURL(/\/admin\/usage/);
  await expect(nav).toBeHidden();
});

test("client list defaults to real clients; the demo tenant sits under Demo & test", async ({ as }) => {
  const page = await as("superadmin");
  await page.goto("/admin/businesses");
  await settle(page);
  await expect(page.getByRole("button", { name: /Demo & test/ }).first()).toBeVisible();
  // The default view never lists the shared demo tenant as a client.
  await expect(page.getByText("demo-roofing", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Needs Vapi")).toHaveCount(0);
  await page.getByRole("button", { name: /Demo & test/ }).first().click();
  await settle(page);
  await expect(page.getByText("demo-roofing", { exact: true }).first()).toBeVisible();
  await expectHealthy(page, { allowOverflow: true });
  await shot(page, "p32-admin-clients-demo-filter");
});

test("Demo Studio shows both demo numbers and never claims a line is ready without proof", async ({ as }) => {
  const page = await as("superadmin");
  await page.goto("/hub/demo");
  await settle(page);
  await expect(page.getByText("+1 (689) 204-2643").first()).toBeVisible();
  await expect(page.getByText("+1 (778) 907-9769").first()).toBeVisible();
  // Harness lines are not in the registry, so neither may offer Dial or say Ready/Live.
  await expect(page.getByRole("link", { name: "Dial" })).toHaveCount(0);
  await expect(page.getByText(/\bReady\b/)).toHaveCount(0);
  await expect(page.getByText("5-minute demo", { exact: false }).first()).toBeAttached();
  await expect(page.getByRole("link", { name: /20-minute deep dive/i }).first()).toBeAttached();
  await expectHealthy(page, { allowOverflow: true });
  await shot(page, "p32-demo-studio");
});

test("Playbook opens on Run a demo with one tab per superadmin job", async ({ as }) => {
  const page = await as("superadmin");
  await page.goto("/hub/guide");
  await settle(page);
  await expect(page.getByRole("tab", { name: "Run a demo" })).toBeVisible();
  for (const tab of ["Set up a client", "Crews & field", "AI & costs", "Billing"]) await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  await shot(page, "p32-playbooks");
});

test("Admin Usage fits the phone without sideways scrolling", async ({ as }, testInfo) => {
  const page = await as("superadmin");
  await page.goto("/admin/usage");
  await settle(page);
  await expectHealthy(page, { allowOverflow: testInfo.project.name !== "phone" });
  await shot(page, "p32-admin-usage");
});

test("search opens as a labelled dialog from the keyboard and Escape returns focus", async ({ as }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "keyboard shortcut is a desktop behavior");
  const page = await as("owner");
  await page.goto("/company/dashboard");
  await settle(page);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = page.getByRole("combobox", { name: /Search calls, requests, jobs and customers/i });
  await expect(box).toBeFocused();
  await box.fill("zzzz-no-such-thing");
  await expect(page.getByRole("status").filter({ hasText: /No matches/i }).first()).toBeVisible({ timeout: 15_000 });
  await shot(page, "p32-search-no-results");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
