import { test, expect, settle, shot } from "./fixtures";
import { db } from "../scripts/e2e/lib.cjs";

test.beforeAll(async () => {
  const business = db().collection("businesses").doc("e2e-roofpros");
  const now = Date.now(), day = 86400000;
  await business.collection("customers").doc("C-FILTER").set({ customerId: "C-FILTER", businessId: business.id, name: "Filter Example", kind: "commercial", active: true, jobCount: 0, lastJobAt: now, createdAt: now, updatedAt: now });
  for (const [id, issuedAt, balance] of [["RD-FILTER-A", now - 40 * day, 100], ["RD-FILTER-B", now - 75 * day, 60], ["RD-FILTER-PAID", now - 40 * day, 0]] as const) {
    await business.collection("invoiceHistory").doc(id).set({ sourceInvoiceId: id, source: "jobba", issuedAt, amount: 100, tax: 0, credits: 100 - balance, amountDue: balance, billTo: "Filter Example", customerId: "C-FILTER", workName: "Example work", voided: false, importedAt: now });
  }
});

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
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "rd-money-finances");
});

test("finance combines card, aging and customer filters and clears each independently", async ({ as }) => {
  const page = await as("proOwner");
  await page.goto("/company/finances");
  await settle(page);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Customer", { exact: true }).fill("Filter Example");
  await expect(page.getByRole("link", { name: "RD-FILTER-PAID", exact: true })).toBeVisible();
  const outstanding = page.getByRole("button", { name: /^Outstanding/ });
  await outstanding.click();
  await expect(page.getByRole("link", { name: "RD-FILTER-PAID", exact: true })).toHaveCount(0);
  const aging = page.getByRole("button", { name: /^1–30 days/ });
  await aging.click();
  await expect(outstanding).toHaveAttribute("aria-pressed", "true");
  await expect(aging).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "RD-FILTER-A", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "RD-FILTER-B", exact: true })).toHaveCount(0);
  await outstanding.click();
  await expect(outstanding).toHaveAttribute("aria-pressed", "false");
  await expect(aging).toHaveAttribute("aria-pressed", "true");
  await aging.click();
  await expect(page.getByRole("link", { name: "RD-FILTER-PAID", exact: true })).toBeVisible();
  await aging.click();
  await page.getByRole("button", { name: "1-30 ×", exact: true }).click();
  await expect(aging).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Filter Example ×", exact: true }).click();
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("");
  await page.getByLabel("Customer", { exact: true }).fill("Filter Example");
  await page.getByRole("heading", { name: "Who owes the most?" }).locator("..").getByRole("button", { name: /^Filter Example/ }).click();
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("");
  await page.getByLabel("Customer", { exact: true }).fill("Filter Example");
  await outstanding.click();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(page.getByLabel("Customer", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("To", { exact: true })).toHaveValue("");
  await expect(outstanding).toHaveAttribute("aria-pressed", "false");
});

test("finance customer, imported invoice and app invoice links reach their records", async ({ as }) => {
  const page = await as("proOwner");
  const visit = async (customer: string) => {
    await page.goto("/company/finances"); await settle(page);
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.getByLabel("Customer", { exact: true }).fill(customer);
  };
  await visit("Filter Example");
  const imported = page.getByRole("row").filter({ hasText: "RD-FILTER-A" });
  await imported.getByRole("link", { name: "Filter Example", exact: true }).click();
  await expect(page).toHaveURL(/\/company\/customers\/C-FILTER$/);
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Filter Example", exact: true })).toBeInViewport();
  await visit("Filter Example");
  await page.getByRole("link", { name: "RD-FILTER-A", exact: true }).click();
  await expect(page).toHaveURL(/\/company\/customers\/C-FILTER$/);
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Filter Example", exact: true })).toBeInViewport();
  await visit("Sample South Homeowner");
  await page.getByRole("link", { name: /INV-3162/ }).click();
  await expect(page).toHaveURL(/\/company\/jobs\/J-3162$/);
  await visit("Filter Example");
  const row = page.getByRole("row").filter({ hasText: "RD-FILTER-A" });
  await row.focus(); await row.press("Space");
  await expect(page).toHaveURL(/\/company\/customers\/C-FILTER$/);
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Filter Example", exact: true })).toBeInViewport();
});
