// Read-only Pay now preview for both companies (Roof Doctors review, 2026-11-05). The invoice screen shows the
// customer's Pay now button as a preview, and its link opens the customer's pay page under the invoice's own company
// letterhead with the buttons switched off. Runs on desktop and phone against the harness (docs/SMOKE-HARNESS.md).
import { test, expect, settle, expectHealthy, shot } from "./fixtures";

for (const [jobId, company, other] of [["J-3161", "Concepts Unlimited", "Roof Pros South"], ["J-3162", "Roof Pros South", "Concepts Unlimited"]] as const) {
  test(`invoice ${jobId} previews Pay now under ${company}, read-only`, async ({ as }) => {
    const page = await as("proOwner");
    await page.goto(`/company/jobs/${jobId}?tab=invoice`);
    const preview = page.getByTestId("pay-now-preview");
    await expect(preview).toBeVisible();
    await preview.scrollIntoViewIfNeeded();
    await expectHealthy(page);
    await shot(page, `pay-now-preview-${jobId}`);

    const [payPage] = await Promise.all([page.context().waitForEvent("page"), preview.getByRole("link", { name: "Open the pay page preview" }).click()]);
    await payPage.waitForLoadState();
    await expect(payPage.getByText("Preview only.")).toBeVisible();
    await expect(payPage.locator("main")).toContainText(company);
    await expect(payPage.locator("main")).not.toContainText(other);
    await expect(payPage.getByRole("button", { name: "Pay by card" })).toBeDisabled();
    await expect(payPage.getByRole("button", { name: "Pay by bank (ACH)" })).toBeDisabled();
    expect(await payPage.locator("form").count()).toBe(0);
    await settle(payPage);
    await shot(payPage, `pay-now-preview-page-${jobId}`);
  });
}
