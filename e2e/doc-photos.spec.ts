// E6b: quote, invoice and report all use the same Before | After photo selection and email layout.
import { api, must, outbox, pngBase64 } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, settle, shot, test } from "./fixtures";

const B = "e2e-roofing";

test("quote, invoice and report include selected Before/After photos", async ({ as }) => {
  test.setTimeout(180_000);
  const owner = await api("owner");
  const tag = Date.now().toString(36);
  const email = `doc-photos-${tag}@customer.e2e.test`;
  const { job } = must(await owner.post("/api/jobs", {
    businessId: B,
    title: `Document photos ${tag}`,
    address: "16 Pairing Lane, Miami, FL",
    clientName: "Paige Pair",
    clientEmail: email,
    clientPhone: "+15557771212",
  }), "create document-photo job");
  const jobId = job.jobId as string;
  const finding = {
    findingId: `finding-${tag}`,
    category: "Roof",
    problem: "Cracked tile near vent",
    solution: "Replace cracked tile and seal vent",
    includeInReport: true,
    includeInQuote: true,
    addedAt: Date.now(),
    lines: [{ kind: "labor", description: "Tile and vent repair", quantity: 1, unitPrice: 425 }],
  };
  must(await owner.patch(`/api/jobs/${jobId}`, { businessId: B, findings: [finding] }), "add finding");

  const beforeLabel = `Damage at section 12 ${tag}`;
  const afterLabel = `Section 12 repaired ${tag}`;
  const before = must(await owner.post(`/api/jobs/${jobId}/photos`, {
    businessId: B, label: beforeLabel, phase: "before", thumbB64: pngBase64(64, 48, [180, 70, 50]),
    fullB64: pngBase64(160, 120, [180, 70, 50]), uploadedBy: "e2e", w: 160, h: 120,
  }), "upload before photo");
  const after = must(await owner.post(`/api/jobs/${jobId}/photos`, {
    businessId: B, label: afterLabel, phase: "after", thumbB64: pngBase64(64, 48, [40, 150, 100]),
    fullB64: pngBase64(160, 120, [40, 150, 100]), uploadedBy: "e2e", w: 160, h: 120,
  }), "upload after photo");
  must(await owner.patch(`/api/jobs/${jobId}/photos/${before.photoId}`, { businessId: B, includeInReport: true }), "select before for report");
  must(await owner.patch(`/api/jobs/${jobId}/photos/${after.photoId}`, { businessId: B, includeInReport: true, pairId: before.photoId }), "pair and select after for report");

  must(await owner.post(`/api/jobs/${jobId}/quote`, { businessId: B }), "create quote");
  must(await owner.post(`/api/jobs/${jobId}/invoice`, { businessId: B }), "create invoice");
  must(await owner.patch(`/api/jobs/${jobId}/invoice`, { businessId: B, addFindings: true }), "add finding to invoice");

  const page = await as("owner");
  await page.goto(`/company/jobs/${jobId}`);
  await settle(page);

  await page.locator(".job-tab").filter({ hasText: "Quote" }).click();
  await settle(page);
  await page.getByText("What the customer sees", { exact: true }).click();
  await expect(page.getByText("Include photos", { exact: true }).first()).toBeVisible();
  const quoteBefore = page.getByRole("checkbox", { name: `Before: ${beforeLabel}` });
  const quoteAfter = page.getByRole("checkbox", { name: `After: ${afterLabel}` });
  await expect(quoteBefore).toBeChecked();
  await expect(quoteAfter).toBeChecked();
  await quoteAfter.uncheck();
  await quoteAfter.check();
  await settle(page, 1400);
  await expect(page.getByRole("img", { name: beforeLabel })).toBeVisible();
  await expect(page.getByRole("img", { name: afterLabel })).toBeVisible();
  await shot(page, "doc-photos-quote");
  await page.getByLabel("Quote recipient email").fill(email);
  await page.getByRole("button", { name: "Send quote" }).click();
  await expect.poll(async () => (await outbox({ to: email, subject: "[Quote]" })).length, { timeout: 20_000 }).toBeGreaterThan(0);
  const quoteMail = (await outbox({ to: email, subject: "[Quote]" }))[0];
  expect(String(quoteMail.html)).toContain(beforeLabel);
  expect(String(quoteMail.html)).toContain(afterLabel);
  expect(String(quoteMail.html)).toMatch(/Before[\s\S]*After[\s\S]*Damage at section 12[\s\S]*Section 12 repaired/);

  await page.locator(".job-tab").filter({ hasText: "Invoice" }).click();
  await settle(page);
  await page.getByText("What the customer sees", { exact: true }).click();
  await expect(page.getByText("Include photos", { exact: true }).first()).toBeVisible();
  const invoiceAfter = page.getByRole("checkbox", { name: `After: ${afterLabel}` });
  await invoiceAfter.uncheck();
  await invoiceAfter.check();
  await settle(page, 1800);
  await expect(page.getByRole("img", { name: beforeLabel })).toBeVisible();
  await expect(page.getByRole("img", { name: afterLabel })).toBeVisible();
  await shot(page, "doc-photos-invoice");
  await page.getByRole("button", { name: "Send to Customer" }).click();
  await page.getByPlaceholder(`Email for ${job.clientName}`).fill(email);
  await page.getByRole("button", { name: "Send Invoice" }).click();
  await expect.poll(async () => (await outbox({ to: email, subject: "[Invoice]" })).length, { timeout: 20_000 }).toBeGreaterThan(0);
  const invoiceMail = (await outbox({ to: email, subject: "[Invoice]" }))[0];
  expect(String(invoiceMail.html)).toContain(beforeLabel);
  expect(String(invoiceMail.html)).toContain(afterLabel);
  expect(String(invoiceMail.html)).toMatch(/Before[\s\S]*After[\s\S]*Damage at section 12[\s\S]*Section 12 repaired/);

  await page.locator(".job-tab").filter({ hasText: "Report" }).click();
  await settle(page);
  const generate = page.getByRole("button", { name: "Generate Report" });
  if (await generate.isVisible().catch(() => false)) await generate.click();
  await settle(page, 1200);
  await expect(page.getByRole("img", { name: beforeLabel })).toBeVisible();
  await expect(page.getByRole("img", { name: afterLabel })).toBeVisible();
  await shot(page, "doc-photos-report");
  await page.getByRole("button", { name: "Mail report" }).click();
  await page.getByPlaceholder(`Email for ${job.clientName}`).fill(email);
  await page.getByRole("button", { name: "Send report" }).click();
  await expect.poll(async () => (await outbox({ to: email, subject: "[Report]" })).length, { timeout: 20_000 }).toBeGreaterThan(0);
  const reportMail = (await outbox({ to: email, subject: "[Report]" }))[0];
  expect(String(reportMail.html)).toContain(beforeLabel);
  expect(String(reportMail.html)).toContain(afterLabel);
  const reportText = String(reportMail.text ?? reportMail.html).replace(/<[^>]+>/g, " ");
  expect(reportText).toContain("section 12");
  expect(reportText).not.toMatch(/\$\s*\d/);
  expect(reportText).not.toMatch(/total|subtotal|estimate/i);
  await expectHealthy(page, { allowOverflow: true });
});
