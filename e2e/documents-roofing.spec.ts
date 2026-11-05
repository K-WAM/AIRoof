import { api, must, pngBase64 } from "../scripts/e2e/lib.cjs";
import { test, expect, expectHealthy, settle, shot } from "./fixtures";

const B = "e2e-roofing";
test("letterhead selection persists on the document", async ({ as }) => {
  test.setTimeout(150_000);
  const owner = await api("owner");
  const b64 = pngBase64(80, 32, [20, 60, 160]);
  const { logo } = must(await owner.post("/api/company/library/logos", { businessId: B, name: "Alternate company", b64, mimeType: "image/png", variant: "color", w: 80, h: 32 }), "logo");
  try {
    const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Letterhead review", clientName: "Example Customer" }), "job");
    must(await owner.post(`/api/jobs/${job.jobId}/quote`, { businessId: B }), "quote");
    const page = await as("owner");
    await page.goto(`/company/jobs/${job.jobId}?tab=quote`);
    await settle(page);
    await page.getByLabel("Letterhead logo").selectOption(logo.logoId);
    await expect.poll(async () => must(await owner.get(`/api/jobs/${job.jobId}/quote?businessId=${B}`), "saved logo").quote.logoId).toBe(logo.logoId);
    await expect(page.locator(".quote-doc header img")).toHaveAttribute("src", `data:image/png;base64,${b64}`);
    await expectHealthy(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, "documents-letterhead");
  } finally { must(await owner.del(`/api/company/library/logos?businessId=${B}&logoId=${logo.logoId}`), "remove test logo"); }
});
test("repair completion lists locations and excludes all quote prices", async ({ as }) => {
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Completion review", address: "14 Example Avenue", clientName: "Example Customer" }), "completion job");
  const finding = { findingId: "f", category: "General", problem: "Worn entry", solution: "Restored entry", includeInReport: true, includeInQuote: true, addedAt: Date.now(), lines: [{ kind: "other", description: "Restore entry", quantity: 1, unitPrice: 1250.5 }] };
  must(await owner.patch(`/api/jobs/${job.jobId}`, { businessId: B, findings: [finding], reportOptions: { includeQuote: true } }), "findings");
  must(await owner.post(`/api/jobs/${job.jobId}/quote`, { businessId: B }), "quote");
  must(await owner.post(`/api/jobs/${job.jobId}/quote/send`, { businessId: B, to: "completion@customer.e2e.test" }), "send quote");
  must(await owner.patch(`/api/jobs/${job.jobId}/quote`, { businessId: B, status: "accepted" }), "accept quote");
  must(await owner.put(`/api/jobs/${job.jobId}/report/settings`, { layout: "repair_completion", locations: "North entry\nSouth entry", noCharge: true }), "completion layout");
  const page = await as("owner");
  await page.goto(`/company/jobs/${job.jobId}?tab=report`);
  await settle(page);
  await expectHealthy(page);
  await expect(page.locator(".report-doc")).toContainText("North entry");
  await expect(page.locator(".report-doc")).toContainText("South entry");
  await expect(page.locator(".report-doc")).toContainText("There is no charge");
  await expect(page.locator(".report-doc")).not.toContainText("$1,250.50");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "documents-completion");
});
test("proposal scope and T&M labor rates render on customer copies", async ({ as }) => {
  test.setTimeout(150_000);
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Service proposal", address: "14 Example Avenue", clientName: "Example Customer" }), "create proposal job");
  must(await owner.post(`/api/jobs/${job.jobId}/quote`, { businessId: B }), "create quote");
  must(await owner.patch(`/api/jobs/${job.jobId}/quote`, { businessId: B, layout: "proposal", lines: [{ lineId: "entry", kind: "other", description: "Restore entrance surface", quantity: 1, unitPrice: 1250.5 }] }), "proposal layout");
  const page = await as("owner");
  await page.goto(`/company/jobs/${job.jobId}?tab=quote`);
  await settle(page);
  await expectHealthy(page);
  await expect(page.locator(".quote-doc li").filter({ hasText: "Restore entrance surface" })).toBeVisible();
  await expect(page.locator(".quote-doc")).toContainText("One Thousand Two Hundred Fifty Dollars and 50/100");
  await page.locator(".quote-doc").scrollIntoViewIfNeeded();
  await shot(page, "documents-proposal");
  await page.getByLabel("Quote layout").selectOption("tm_authorization");
  await expect.poll(async () => must(await owner.get(`/api/jobs/${job.jobId}/quote?businessId=${B}`), "saved quote").quote.layout).toBe("tm_authorization");
  await expect(page.locator(".quote-doc").getByRole("heading", { name: "Labor rates" })).toBeVisible();
  await expect(page.locator(".quote-doc table")).toContainText("Hourly rate");
  await expect(page.locator(".quote-doc")).not.toContainText("$1,250.50");
  await page.locator(".quote-doc").scrollIntoViewIfNeeded();
  await shot(page, "documents-tm");
});
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
  await expect(page.locator(".invoice-doc")).toContainText("Service at");
  await expect(page.locator(".invoice-doc")).toContainText("Description: Document review");
  expect(await page.locator(".invoice-doc").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "documents-invoice");
});
