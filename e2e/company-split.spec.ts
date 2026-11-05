// Company split (T-317). The integrator runs this after the other stream seeds e2e-roofpros with companies
// "rdsf" (default) and "rcu", the customer "Lakeview County Schools" (rcu) with a sent RCU invoice, and an RDSF
// job with a sent invoice. We write it here; it is NOT run by the T-317 worker.

import { api, must } from "../scripts/e2e/lib.cjs";
import { test, expect, settle, shot } from "./fixtures";

interface FinanceCompany {
  id: string;
  shortName: string;
  isDefault: boolean;
}
interface FinanceRow {
  invoiceNo: string;
  customer: string;
  companyId?: string;
  total: number;
}
interface FinanceView {
  companies?: FinanceCompany[];
  rows: FinanceRow[];
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

test("finances filter and jobs badge split by company", async ({ as }) => {
  // Preconditions from the seed (fail with the exact problem, not a mystery selector timeout).
  const apiOwner = await api("proOwner");
  const finance = must(await apiOwner.get("/api/company/finance"), "GET /api/company/finance") as FinanceView;
  expect(finance.companies?.map((c) => c.id).sort()).toEqual(["rcu", "rdsf"]);
  const rcu = finance.companies!.find((c) => c.id === "rcu")!;
  const rdsf = finance.companies!.find((c) => c.isDefault)!;
  const rcuRow = finance.rows.find((r) => r.companyId === rcu.id);
  const rdsfRow = finance.rows.find((r) => r.companyId === rdsf.id);
  expect(rcuRow?.customer).toContain("Lakeview County Schools");
  expect(rdsfRow).toBeTruthy();

  const page = await as("proOwner");
  await page.goto("/company/finances");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Finances" })).toBeVisible();

  // All | RDSF | RCU, defaulting to All.
  const filter = page.getByRole("group", { name: "Filter by company" });
  await expect(filter).toBeVisible();
  await expect(filter.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
  await filter.getByRole("button", { name: "RCU", exact: true }).click();
  await settle(page);

  // Only the RCU invoice, with its own total; the RDSF invoice is gone.
  const rcuInvoice = page.getByRole("row").filter({ hasText: rcuRow!.invoiceNo });
  await expect(rcuInvoice).toHaveCount(1);
  await expect(rcuInvoice).toContainText(rcuRow!.customer);
  await expect(rcuInvoice).toContainText(money(rcuRow!.total));
  await expect(page.getByRole("row").filter({ hasText: rdsfRow!.invoiceNo })).toHaveCount(0);
  await shot(page, "company-split-finances-rcu");

  // The RCU job carries its badge in Jobs (search narrows the list and also proves the short-name match).
  await page.goto("/company/jobs");
  await settle(page);
  await page.getByRole("textbox", { name: "Search jobs" }).fill("rcu");
  await expect(page.getByTitle("Billed as RCU").filter({ visible: true }).first()).toBeVisible();
  await shot(page, "company-split-jobs-rcu");

  // A single-company business sees no filter at all.
  const single = await as("owner");
  await single.goto("/company/finances");
  await settle(single);
  await expect(single.getByRole("heading", { name: "Finances" })).toBeVisible();
  await expect(single.getByRole("group", { name: "Filter by company" })).toHaveCount(0);
  await shot(single, "company-split-finances-single");
});
