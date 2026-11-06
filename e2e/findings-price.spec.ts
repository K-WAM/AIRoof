import { openJobPanel } from "./fixtures";
import { api, must } from "../scripts/e2e/lib.cjs";
import { test, expect, settle, expectHealthy, shot } from "./fixtures";

test("findings show the saved quote price and open its only price editor", async ({ as }) => {
  const owner = await api("proOwner"), businessId = "e2e-roofpros";
  const { job } = must(await owner.post("/api/jobs", { businessId, title: "Finding price review" }), "job");
  const findings = [100, 50].map((price, i) => ({ findingId: `price-${i}`, category: "Roof", problem: `Leak ${i + 1}`, solution: `Repair ${i + 1}`, includeInQuote: true, includeInReport: true, addedAt: Date.now(), lines: [{ kind: "other", description: `Repair ${i + 1}`, quantity: 1, unitPrice: price }] }));
  must(await owner.patch(`/api/jobs/${job.jobId}`, { businessId, findings }), "findings");
  must(await owner.post(`/api/jobs/${job.jobId}/quote`, { businessId }), "quote");
  const page = await as("proOwner"); await page.goto(`/company/jobs/${job.jobId}?tab=findings`); await settle(page);
  await expect(page.getByTestId("finding-price").first()).toContainText("On the quote: $100.00");
  await page.getByRole("button", { name: "Change price on the quote" }).first().click();
  const price = page.getByRole("textbox", { name: "Unit price", exact: true }).first();
  await price.fill("125"); await price.blur();
  await expect.poll(async () => must(await owner.get(`/api/jobs/${job.jobId}/quote?businessId=${businessId}`), "saved quote").quote.lines[0].unitPrice).toBe(125);
  await openJobPanel(page, "findings");
  await expect(page.getByTestId("finding-price").first()).toContainText("On the quote: $125.00");
  await page.getByTestId("finding-price").first().scrollIntoViewIfNeeded(); await shot(page, "findings-quote-price");
  await expectHealthy(page);
});
