import { api, db, must, outbox, pngBase64 } from "../scripts/e2e/lib.cjs";
import { test, expect, expectHealthy, settle, shot } from "./fixtures";

const B = "e2e-roofpros";
test("classic documents, company letterhead, finding prices and branding picker", async ({ as }) => {
  test.setTimeout(300_000);
  const owner = await api("proOwner"), tag = Date.now(), email = "owner@roofpros.e2e.test";
  const ref = db().collection("businesses").doc(B);
  const original = (await ref.get()).data()!;
  try {
    must(await owner.put("/api/company/settings", { businessId: B, documentStyle: "classic" }), "classic style");
    await ref.update({ websiteUrl: "https://south.example.test" });
    const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Classic document review", clientName: "Sample Customer", clientEmail: email, address: "12 Sample Way" }), "job");
    const findings = [100, 50].map((price, i) => ({ findingId: `f${i}`, category: "Roof", problem: `Leak ${i + 1}`, solution: `Repair ${i + 1}`, includeInReport: true, includeInQuote: true, addedAt: tag, lines: [{ kind: "other", description: `Repair ${i + 1}`, quantity: 1, unitPrice: price }] }));
    must(await owner.patch(`/api/jobs/${job.jobId}`, { businessId: B, findings }), "findings");
    const photo = must(await owner.post(`/api/jobs/${job.jobId}/photos`, { businessId: B, label: "Classic before", phase: "before", thumbB64: pngBase64(64, 48, [80, 110, 130]), fullB64: pngBase64(160, 120, [80, 110, 130]), uploadedBy: "e2e", w: 160, h: 120 }), "photo");
    must(await owner.patch(`/api/jobs/${job.jobId}/photos/${photo.photoId}`, { businessId: B, includeInReport: true }), "select photo");
    const { quote } = must(await owner.post(`/api/jobs/${job.jobId}/quote`, { businessId: B }), "quote");
    const page = await as("proOwner");
    const visit = async (tab: string) => { await page.goto(`/company/jobs/${job.jobId}?tab=${tab}`); await settle(page); await expectHealthy(page); };
    await visit("findings");
    await expect(page.getByTestId("finding-price").first()).toContainText("On the quote: $100.00");
    await page.getByRole("button", { name: "Change price on the quote" }).first().click();
    await expect(page.locator(".quote-doc.k1-classic")).toBeVisible();
    await shot(page, "classic-plain-quote");
    for (const layout of ["proposal", "tm_authorization"]) {
      must(await owner.patch(`/api/jobs/${job.jobId}/quote`, { businessId: B, layout }), layout);
      await visit("quote");
      await expect(page.locator(".quote-doc.k1-classic")).toContainText("LIC# SAMPLE-RDSF");
      await shot(page, `classic-${layout}`);
    }
    for (const layout of ["inspection_completion", "repair_completion"]) {
      must(await owner.put(`/api/jobs/${job.jobId}/report/settings`, { layout }), layout);
      await visit("report");
      await expect(page.locator(".report-doc.k1-classic")).toContainText("LIC# SAMPLE-RDSF");
      await expect(page.locator(".report-doc img[alt='Classic before']")).toBeVisible();
      await shot(page, `classic-${layout}`);
    }
    must(await owner.post(`/api/jobs/${job.jobId}/invoice`, { businessId: B }), "invoice");
    must(await owner.patch(`/api/jobs/${job.jobId}/invoice`, { businessId: B, other: [{ lineId: "repair", description: "Repair service", amount: 150 }] }), "invoice line");
    await visit("invoice");
    const invoice = page.locator(".invoice-doc.k1-classic");
    for (const text of ["Invoice No.", "Subtotal:", "Sales Tax:", "Total Due:", "LIC# SAMPLE-RDSF"]) await expect(invoice).toContainText(text);
    const table = invoice.locator(".k1-classic-items");
    expect(await table.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await shot(page, "classic-invoice");
    await page.emulateMedia({ media: "print" }); await shot(page, "classic-invoice-print"); await page.emulateMedia({ media: "screen" });
    must(await owner.post(`/api/jobs/${job.jobId}/invoice/deposits`, { businessId: B, requestId: `classic-${tag}`, percent: 50, basis: 150 }), "deposit");
    await visit("invoice");
    await page.getByText("Deposits (1)", { exact: true }).click();
    await page.getByRole("button", { name: "Review deposit", exact: true }).click();
    await expect(page.getByRole("region", { name: "Deposit invoices", exact: true }).locator(".k1-classic")).toContainText("Invoice No.");
    await shot(page, "classic-deposit");
    for (const kind of ["invoice", "quote"]) must(await owner.patch(`/api/jobs/${job.jobId}/company`, { businessId: B, kind, companyId: "rcu" }), `RCU ${kind} switch`);
    await visit("invoice");
    await expect(invoice).toContainText("LIC# SAMPLE-RCU");
    await expect(invoice).not.toContainText("south.example.test");
    await shot(page, "classic-rcu-invoice");
    must(await owner.post(`/api/jobs/${job.jobId}/quote/send`, { businessId: B, to: email }), "email quote");
    must(await owner.post(`/api/jobs/${job.jobId}/invoice/send`, { businessId: B, to: email }), "email invoice");
    const messages = (await outbox({ to: email })).filter(message => String(message.html).includes(job.jobId));
    expect(messages).toHaveLength(2);
    for (const message of messages) { expect(String(message.html)).toContain("STATE LICENSE #SAMPLE-RCU"); expect(String(message.html)).not.toContain("south.example.test"); }
    expect(quote.quoteId).toBeTruthy();
    await page.goto("/company/library?section=branding"); await settle(page);
    const picker = page.getByTestId("document-style-section");
    await picker.getByRole("radio", { name: /^Standard/ }).check();
    await expect.poll(async () => must(await owner.get(`/api/company/settings?businessId=${B}`), "saved style").documentStyle).toBe("standard");
    await picker.getByRole("radio", { name: /^Classic letterhead/ }).check();
    await expect.poll(async () => must(await owner.get(`/api/company/settings?businessId=${B}`), "saved style").documentStyle).toBe("classic");
    await picker.scrollIntoViewIfNeeded(); await shot(page, "classic-branding"); await expectHealthy(page);
  } finally {
    must(await owner.put("/api/company/settings", { businessId: B, documentStyle: "standard" }), "restore style");
    await ref.update({ websiteUrl: original.websiteUrl ?? null });
  }
});
