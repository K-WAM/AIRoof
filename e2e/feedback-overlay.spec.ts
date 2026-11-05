import { expect, test } from "./fixtures";

// Owner, 2026-11-05: "when I hit Feedback while on Calendar it would show random floating text" — the phone menu stayed
// open behind the Feedback window, its items peeking out below it. The shell now closes the menu before opening it.
for (const path of ["/company/calendar", "/company/dashboard"]) {
  test(`Feedback opens alone on ${path}`, async ({ as }) => {
    const page = await as("owner");
    await page.goto(path);
    // The shell is interactive once the industry bootstrap has resolved (same wait as role-matrix).
    await expect(page.locator(".company-shell")).toHaveAttribute("data-portal-family", /\S+/);
    const menu = page.getByRole("button", { name: /^(Open menu|Menu)$/ });
    const phone = await menu.isVisible();
    if (phone) {
      await menu.click();
      await expect(page.locator("#company-mobile-nav")).toBeVisible();
    }
    await page.getByRole("button", { name: "Send feedback" }).first().click();
    await expect(page.getByRole("dialog", { name: /Send feedback/ })).toBeVisible();
    if (phone) {
      await expect(page.locator("#company-mobile-nav")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    }
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
