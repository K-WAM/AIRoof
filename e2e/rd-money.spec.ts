import { test, expect, settle, shot } from "./fixtures";

test("finance cards and aging toggle list filters", async ({ as }) => {
  const page = await as("proOwner");
  await page.goto("/company/finances");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Finances" })).toBeVisible();
  const outstanding = page.getByRole("button", { name: /^Outstanding/ });
  await outstanding.click();
  await expect(outstanding).toHaveAttribute("aria-pressed", "true");
  await outstanding.click();
  await expect(outstanding).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: /^Not due yet/ }).click();
  await expect(page.getByRole("button", { name: "Not due yet ×" })).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByRole("button", { name: "Not due yet ×" })).toHaveCount(0);
  await shot(page, "rd-money-finances");
});
