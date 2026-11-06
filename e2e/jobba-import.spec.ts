import { mkdirSync } from "node:fs";
import { test, expect, settle, shot, expectHealthy } from "./fixtures";
import { api, db, must } from "../scripts/e2e/lib.cjs";

// The CSV import is run locally before this spec. No client values are embedded in tests or committed artifacts.
// Without that import (a fresh harness, or anyone without the git-ignored client files) the spec skips instead of failing.
test("all imported customers are listed and searchable", async ({ as }) => {
  const imported = await db().collection("businesses/e2e-roofpros/customers").where("source", "==", "jobba").get();
  test.skip(imported.size === 0, "Run the local Jobba import into e2e-roofpros first (docs/clients/JOBBA-SETUP-MAPPING.md).");
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

test("setup crews, labor rates and finding categories appear in their existing screens", async ({ as }, testInfo) => {
  const owner = await api("proOwner");
  const businessId = "e2e-roofpros";
  const crews = must(await owner.get(`/api/company/crews?businessId=${businessId}`), "crews").crews as Array<{ crewId: string; name: string }>;
  const importedCrews = crews.filter(c => c.crewId.startsWith("jobba-crew-"));
  test.skip(importedCrews.length === 0, "Run the local Jobba setup import into e2e-roofpros first.");
  expect(importedCrews).toHaveLength(5);
  const library = must(await owner.get(`/api/company/library?businessId=${businessId}`), "pricing").library;
  expect(library.laborRates.length).toBeGreaterThanOrEqual(3);
  const page = await as("proOwner");
  await page.goto("/company/library?section=crews"); await settle(page);
  await expect(page.getByText(importedCrews[0].name, { exact: true }).first()).toBeVisible();
  await shot(page, "jobba-library-crews");
  await page.goto("/company/library?section=pricing"); await settle(page);
  const labor = page.getByRole("heading", { name: "Labor rates & tax" });
  await labor.scrollIntoViewIfNeeded();
  const laborTop = await labor.evaluate(el => el.getBoundingClientRect().top);
  await page.evaluate(top => window.scrollBy(0, top - 150), laborTop);
  await expect(labor).toBeInViewport();
  const directory = `test-results/screens/${testInfo.project.name}`;
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/jobba-library-labor.png`, fullPage: false });
  await page.evaluate(() => window.scrollBy(0, 450));
  await page.screenshot({ path: `${directory}/jobba-library-labor-continued.png`, fullPage: false });
  await page.goto("/company/settings"); await settle(page);
  const payment = page.getByRole("combobox", { name: "Payment due", exact: true });
  await payment.scrollIntoViewIfNeeded();
  const terms = must(await owner.get(`/api/company/settings/billing?businessId=${businessId}`), "payment defaults").prefs.importedTerms as Array<{ name: string; dueDays: number }>;
  expect(terms).toHaveLength(6);
  for (const term of terms) await expect(payment.locator(`option[value="${term.dueDays}"]`)).toBeAttached();
  await page.getByText("Imported payment terms (6)", { exact: true }).click();
  for (const term of terms) await expect(page.getByText(`${term.name} / ${term.dueDays} days`, { exact: true })).toBeVisible();
  await page.getByTestId("getting-paid").screenshot({ path: `${directory}/jobba-payment-terms.png` });
  await page.goto("/company/field?jobId=J-3163"); await settle(page);
  await page.getByRole("button", { name: /Finding$/, exact: false }).filter({ visible: true }).click();
  const category = page.getByRole("combobox", { name: "Finding category" });
  await expect(category).toBeVisible();
  const catalog = (await db().doc("businesses/e2e-roofpros/library/workCatalog").get()).data();
  expect(catalog?.categories.length).toBe(115);
  await category.selectOption(catalog!.categories[0]);
  await expect(page.getByText("No standard fixes saved for this category yet.")).toBeVisible();
  await page.screenshot({ path: `${directory}/jobba-finding-categories.png`, fullPage: false });
});
