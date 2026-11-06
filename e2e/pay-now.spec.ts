import { test, expect, shot, expectHealthy } from "./fixtures";

test("owner sees online payment status; an invalid customer link reveals no invoice", async ({ as }) => {
  const page = await as("owner");
  await page.goto("/company/settings#getting-paid");
  const panel = page.getByTestId("getting-paid");
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByRole("heading", { name: "Online payments" })).toBeVisible();
  await expect(panel.getByText("Not connected", { exact: true })).toBeVisible();
  // No Stripe platform in the harness: one plain line, not two controls that can't be used.
  await expect(panel.getByText("Online payments are not available for this workspace yet.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Connect Stripe", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("switch", { name: "Show a Pay now button on invoices" })).toHaveCount(0);
  await shot(page, "pay-now-settings");
  await expectHealthy(page);
  await page.goto("/api/pay/invoice?b=e2e-roofing&i=INV-1&t=invalid");
  await expect(page.getByRole("heading", { name: "Payment link unavailable" })).toBeVisible();
  await expect(page.getByText(/This payment link isn't available/)).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  await shot(page, "pay-now-unavailable");
  await expectHealthy(page);
});
