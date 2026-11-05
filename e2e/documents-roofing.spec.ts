import { api, must } from "../scripts/e2e/lib.cjs";
import { test, expect, expectHealthy, settle, shot } from "./fixtures";

const B = "e2e-roofing";
test("invoice drafts include the priced findings", async ({ as }) => {
  test.setTimeout(150_000);
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Document review", address: "14 Example Avenue", clientName: "Example Customer" }), "create job");
  const finding = { findingId: "entrance", category: "General", problem: "Worn entrance surface", solution: "Restore entrance surface",
    includeInReport: true, includeInQuote: true, addedAt: Date.now(), lines: [{ kind: "other", description: "Restore entrance surface", quantity: 1, unitPrice: 1760 }] };
  must(await owner.patch(`/api/jobs/${job.jobId}`, { businessId: B, findings: [finding] }), "add findings");
  const { invoice } = must(await owner.post(`/api/jobs/${job.jobId}/invoice`, { businessId: B }), "draft invoice");
  expect(invoice.total).toBe(1760);
  const page = await as("owner");
  await page.goto(`/company/jobs/${job.jobId}?tab=invoice`);
  await settle(page);
  await expectHealthy(page);
  await expect(page.getByText("Restore entrance surface").first()).toBeVisible();
  await expect(page.getByText("$1,760.00").first()).toBeVisible();
  await shot(page, "documents-invoice");
});
