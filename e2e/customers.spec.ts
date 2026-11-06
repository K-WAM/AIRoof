import { mkdirSync } from "node:fs";
import { test, expect, settle, shot, expectHealthy } from "./fixtures";
import { api, must } from "../scripts/e2e/lib.cjs";

test("customer past work combines work orders and legacy inspections read-only", async ({ as }, testInfo) => {
  const owner = await api("proOwner");
  const history = must(await owner.get("/api/company/customers/C-3160/history?businessId=e2e-roofpros"), "history").items;
  expect(history).toHaveLength(12);
  expect(history[0].kind).toBe("work-order");
  const page = await as("proOwner");
  await page.goto("/company/customers?customerId=C-3160"); await settle(page);
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
  // The list accepts a selected customer through its normal open action.
  if (!(await page.getByRole("heading", { name: "Past work from Jobba (12)" }).count())) {
    await page.locator(".c1-customer-card").filter({ hasText: "Lakeview County Schools" }).getByRole("button").click();
  }
  const heading = page.getByRole("heading", { name: "Past work from Jobba (12)" });
  await heading.scrollIntoViewIfNeeded();
  const historyPanel = heading.locator("..");
  await expect(historyPanel.locator("details")).toHaveCount(10);
  await expect(historyPanel.locator("summary").first()).toContainText("Work order");
  await historyPanel.locator("summary").first().click();
  await expect(historyPanel.getByText(/Repair sample flashing/)).toBeVisible();
  await expect(historyPanel.getByText(/Repair sample flashing/)).toBeInViewport();
  await historyPanel.locator("summary").first().scrollIntoViewIfNeeded();
  mkdirSync(`test-results/screens/${testInfo.project.name}`, { recursive: true });
  await page.screenshot({ path: `test-results/screens/${testInfo.project.name}/customers-past-work-phone-view.png` });
  await shot(page, "customers-past-work-expanded");
  await historyPanel.getByRole("button", { name: "Show all (12)" }).click();
  await expect(historyPanel.locator("details")).toHaveCount(12);
  await expect(historyPanel.locator("summary").last()).toContainText("Inspection");
  await expect(historyPanel.getByRole("textbox")).toHaveCount(0);
  await expectHealthy(page);
});
