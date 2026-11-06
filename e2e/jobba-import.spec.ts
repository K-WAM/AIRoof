import { test, expect, settle, shot, expectHealthy } from "./fixtures";
import { api, db, must } from "../scripts/e2e/lib.cjs";

// The CSV import is run locally before this spec. No client values are embedded in tests or committed artifacts.
test("all imported customers are listed and searchable", async ({ as }) => {
  const imported = await db().collection("businesses/e2e-roofpros/customers").where("source", "==", "jobba").get();
  expect(imported.size).toBe(191);
  const owner = await api("proOwner");
  const listed = must(await owner.get("/api/company/customers?businessId=e2e-roofpros"), "customer list").customers as Array<{ customerId: string }>;
  const ids = new Set(listed.map(c => c.customerId));
  expect(imported.docs.every(d => ids.has(d.id))).toBe(true);
  const page = await as("proOwner");
  await page.goto("/company/customers"); await settle(page);
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
  await page.getByPlaceholder(/Search customers or phone/).fill(imported.docs[0].data().name);
  await expect(page.locator(".c1-customer-card")).toHaveCount(1);
  await expectHealthy(page);
  await shot(page, "jobba-customers-listed");
});

