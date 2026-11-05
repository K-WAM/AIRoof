import { api, must } from "../scripts/e2e/lib.cjs";
import { test, expect, expectHealthy, settle, shot } from "./fixtures";

const B = "e2e-roofing";
test("letters editor previews and saves plain text", async ({ as }) => {
  const page = await as("owner");
  await page.goto("/company/library?section=documents");
  await settle(page);
  await expectHealthy(page);
  const editor = page.getByRole("region", { name: "Letters and notices" });
  await expect(editor.getByLabel("Title", { exact: true })).toBeEnabled();
  await editor.getByLabel("Letter", { exact: true }).selectOption("repair_completion");
  await expect(editor.getByText("Main entrance", { exact: false }).last()).toBeVisible();
  await editor.getByRole("button", { name: "Save letter", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("Saved");
  await shot(page, "documents-letters-editor");
});
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
