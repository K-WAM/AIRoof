import { test, expect, expectHealthy, shot } from "./fixtures";
import { ACCOUNTS } from "../scripts/e2e/config.cjs";
import { adminApp } from "../scripts/e2e/seed.cjs";

test("booking-only demo omits Field and keeps the live-call fallback", async ({ page }) => {
  await page.goto("/try/dental");
  await expect(page.getByRole("heading", { name: "Try the demo" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Demo steps" }).locator(":scope > li")).toHaveCount(2);
  await expect(page.getByTestId("demo-step-field")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Book a live call" })).toHaveAttribute("href", /mailto:connect@luxordev.com/);
  await expect(page.getByTestId("demo-step-call")).toContainText("I'm a new patient");
  await expectHealthy(page);
  await shot(page, "try-dental-two-steps");
});

test("pet care uses visit wording and its own note", async ({ page }) => {
  await page.goto("/try/pet-care");
  await expect(page.getByRole("heading", { name: "Try the demo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "See a visit update" })).toBeVisible();
  await expect(page.getByTestId("field-update-example")).toContainText("Walked Bella 30 minutes");
  await expect(page.getByRole("button", { name: "View visit updates →" })).toBeVisible();
  await expectHealthy(page);
  await shot(page, "try-pet-care-three-steps");
});

// Exercise the real sign-in/navigation with ONLY the configured local viewer,
// replacing the public token endpoint so no separate sandbox account is made.
for (const entry of [
  { button: "Open Sample App", target: /\/company\/pipeline$/ },
]) {
  test(`${entry.button} opens the intended app screen`, async ({ page }) => {
    const token = await adminApp.auth().createCustomToken(ACCOUNTS.viewer.uid);
    await page.route("**/api/demo/sandbox-token", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ vertical: "roofing" });
      await route.fulfill({ json: { token } });
    });
    await page.goto("/try/roofing");
    await page.getByText("Try the Shared Phone Line", { exact: true }).click();
    await page.getByRole("button", { name: entry.button }).click();
    await expect(page).toHaveURL(entry.target);
    await expect(page.getByText(/Failed to load this page|Application error/)).toHaveCount(0);
    await expectHealthy(page);
  });
}

test("unavailable demo stays on the page with a clear error", async ({ page }) => {
  await page.route("**/api/demo/sandbox-token", (route) => route.fulfill({ status: 503, json: { error: "Sandbox unavailable" } }));
  await page.goto("/try/roofing");
  await page.getByText("Try the Shared Phone Line", { exact: true }).click();
  await page.getByRole("button", { name: "Open Sample App" }).click();
  await expect(page.getByText("Sandbox unavailable")).toBeVisible();
  await expect(page).toHaveURL(/\/try\/roofing$/);
  await expect(page.getByRole("button", { name: "Open Sample App" })).toBeEnabled();
});
