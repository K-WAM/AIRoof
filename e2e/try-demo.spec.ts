import { test, expect, expectHealthy, shot } from "./fixtures";
import { ACCOUNTS } from "../scripts/e2e/config.cjs";
import { adminApp } from "../scripts/e2e/seed.cjs";

test("public roofing demo is one ordered three-step story", async ({ page }) => {
  await page.goto("/try/roofing");
  await expect(page.getByRole("heading", { name: "Try the demo" })).toBeVisible();
  const steps = page.getByRole("list", { name: "Demo steps" });
  await expect(steps.locator(":scope > li")).toHaveCount(3);
  await expect(steps.getByRole("heading")).toHaveText([
    "1Call reception and make a booking", "2See how bookings appear", "3See a field update",
  ]);
  await expect(page.getByRole("link", { name: "Call Alice" })).toBeInViewport();
  await expect(page.getByRole("link", { name: "Call Alice" })).toHaveAttribute("href", "tel:+16892042643");
  await expect(page.locator(".button.primary")).toHaveCount(1);
  await expect(page.getByText("Sample data, separate from your call. Viewing only.")).toBeVisible();
  await expect(page.getByTestId("field-update-example")).toContainText("Six cracked tiles on the south slope.");
  await expect(page.getByTestId("field-update-example")).toContainText("Split pipe boot at the vent penetration.");
  await expect(page.getByText("Explore the sample. Saving is turned off.")).toBeVisible();
  await expectHealthy(page);
  await shot(page, "try-roofing-three-steps");
  await page.getByTestId("demo-step-field").scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "View field updates →" })).toBeInViewport();
  for (const control of await page.locator(".button").all()) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

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
  { button: "See the app →", target: /\/company\/calendar$/ },
  { button: "View field updates →", target: /\/company\/field\?jobId=J-1001$/ },
]) {
  test(`${entry.button} opens the intended app screen`, async ({ page }) => {
    const token = await adminApp.auth().createCustomToken(ACCOUNTS.viewer.uid);
    await page.route("**/api/demo/sandbox-token", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ vertical: "roofing" });
      await route.fulfill({ json: { token } });
    });
    await page.goto("/try/roofing");
    await page.getByRole("button", { name: entry.button }).click();
    await expect(page).toHaveURL(entry.target);
    await expect(page.getByText(/Failed to load this page|Application error/)).toHaveCount(0);
    await expectHealthy(page);
  });
}

test("unavailable demo stays on the page with a clear error", async ({ page }) => {
  await page.route("**/api/demo/sandbox-token", (route) => route.fulfill({ status: 503, json: { error: "Sandbox unavailable" } }));
  await page.goto("/try/roofing");
  await page.getByRole("button", { name: "View field updates →" }).click();
  await expect(page.getByText("Sandbox unavailable")).toBeVisible();
  await expect(page).toHaveURL(/\/try\/roofing$/);
  await expect(page.getByRole("button", { name: "View field updates →" })).toBeEnabled();
});
