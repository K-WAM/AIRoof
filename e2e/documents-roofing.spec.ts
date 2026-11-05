import { api, must, outbox, pngBase64 } from "../scripts/e2e/lib.cjs";
import { test, expect, expectHealthy, settle, shot as captureShot } from "./fixtures";

const shot: typeof captureShot = async (page, name) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  return captureShot(page, name);
};

const B = "e2e-roofing";
test("scope and renewal fields and category findings match app email and print", async ({ as }) => {
  test.setTimeout(240_000);
  const owner = await api("owner"), tag = Date.now(), email = `sections-${tag}@customer.e2e.test`;
  const templates = must(await owner.get("/api/company/library/letters"), "letter templates").templates;
  const inspection = templates.find((template: { kind: string }) => template.kind === "inspection_completion");
  const proposal = templates.find((template: { kind: string }) => template.kind === "proposal");
  try {
    must(await owner.put("/api/company/library/letters", { ...inspection, sections: [{ id: "scope", heading: "Completed scope", body: "{{scope}}" }, { id: "renewal", body: "Renewal month: {{renewalMonth}}", optional: true, defaultOn: true }] }), "inspection fields");
    must(await owner.put("/api/company/library/letters", { ...proposal, sections: [{ id: "scope", heading: "Scope of Work", body: "{{scope}}" }] }), "proposal scope");
    const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Category document review", address: "14 Example Avenue", clientName: "Example Customer", clientEmail: email }), "section job");
    const findings = [
      { findingId: "entry", category: "Entry", problem: "Worn entry surface", solution: "Restore entry surface", includeInReport: true, includeInQuote: true, addedAt: tag, lines: [{ kind: "other", description: "Entry service", quantity: 1, unitPrice: 100 }] },
      { findingId: "access", category: "Access", problem: "Loose access fitting", solution: "Secure access fitting", includeInReport: true, includeInQuote: true, addedAt: tag, lines: [{ kind: "other", description: "Access service", quantity: 1, unitPrice: 50 }] },
    ];
    must(await owner.patch(`/api/jobs/${job.jobId}`, { businessId: B, findings }), "section findings");
    for (const phase of ["before", "after"]) {
      const photo = must(await owner.post(`/api/jobs/${job.jobId}/photos`, { businessId: B, label: `${phase} section`, phase, thumbB64: pngBase64(64, 48, [80, 110, 130]), fullB64: pngBase64(160, 120, [80, 110, 130]), uploadedBy: "e2e", w: 160, h: 120 }), "section photo");
      must(await owner.patch(`/api/jobs/${job.jobId}/photos/${photo.photoId}`, { businessId: B, includeInReport: true }), "select section photo");
    }
    must(await owner.put(`/api/jobs/${job.jobId}/report/settings`, { layout: "inspection_completion" }), "inspection layout");
    const page = await as("owner");
    await page.goto(`/company/jobs/${job.jobId}?tab=report`); await settle(page); await expectHealthy(page);
    await expect(page.getByText("Unfilled letter fields: renewalMonth", { exact: true })).toBeVisible();
    await expect(page.locator(".report-doc li")).toHaveText(["Restore entry surface", "Secure access fitting"]);
    await expect(page.getByLabel("Show findings as Problem / Corrective Action")).toBeChecked();
    await page.getByLabel("Renewal month", { exact: true }).fill("September 2026");
    await page.getByLabel("Renewal month", { exact: true }).blur();
    await expect.poll(async () => must(await owner.get(`/api/jobs/${job.jobId}?businessId=${B}`), "renewal saved").job.reportDocument.renewalMonth).toBe("September 2026");
    const report = page.locator(".report-doc");
    await expect(report).toContainText("Renewal month: September 2026");
    await expect(report.locator(".document-finding h3")).toHaveText(["Entry", "Access"]);
    await expect(report.locator(".document-finding").first()).toContainText("Problem: Worn entry surface");
    await expect(report.locator(".document-finding").first()).toContainText("Corrective Action: Restore entry surface");
    await expect(report).not.toContainText("$");
    await expect(report.locator("img[alt='before section']")).toHaveCount(1);
    await expect(report.locator("img[alt='after section']")).toHaveCount(1);
    must(await owner.post(`/api/jobs/${job.jobId}/report/send`, { businessId: B, to: email }), "section report email");
    await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "documents-sections-report");
    await page.emulateMedia({ media: "print" }); await shot(page, "documents-sections-report-print"); await page.emulateMedia({ media: "screen" });
    must(await owner.post(`/api/jobs/${job.jobId}/quote`, { businessId: B }), "section quote");
    must(await owner.patch(`/api/jobs/${job.jobId}/quote`, { businessId: B, layout: "proposal", lines: [{ lineId: "scope", kind: "other", description: "Quoted scope only", quantity: 1, unitPrice: 150 }] }), "quoted scope");
    await page.goto(`/company/jobs/${job.jobId}?tab=quote`); await settle(page); await expectHealthy(page);
    await expect(page.locator(".quote-doc li")).toHaveText(["Quoted scope only"]);
    must(await owner.post(`/api/jobs/${job.jobId}/quote/send`, { businessId: B, to: email }), "scope quote email");
    const { invoice } = must(await owner.post(`/api/jobs/${job.jobId}/invoice`, { businessId: B }), "section invoice");
    await page.goto(`/company/jobs/${job.jobId}?tab=invoice`); await settle(page); await expectHealthy(page);
    const invoiceDoc = page.locator(".invoice-doc");
    await expect(invoiceDoc.locator(".document-finding h3")).toHaveText(["Entry", "Access"]);
    await page.getByLabel("Show findings as Problem / Corrective Action").uncheck();
    await expect.poll(async () => must(await owner.get(`/api/jobs/${job.jobId}/invoice?businessId=${B}`), "invoice choice").invoice.showFindingSections).toBe(false);
    await expect(invoiceDoc.locator(".document-finding")).toHaveCount(0);
    await page.getByLabel("Show findings as Problem / Corrective Action").check();
    await expect.poll(async () => must(await owner.get(`/api/jobs/${job.jobId}/invoice?businessId=${B}`), "invoice choice").invoice.showFindingSections).toBe(true);
    expect(must(await owner.get(`/api/jobs/${job.jobId}/invoice?businessId=${B}`), "unchanged total").invoice.total).toBe(invoice.total);
    must(await owner.post(`/api/jobs/${job.jobId}/invoice/send`, { businessId: B, to: email }), "section invoice email");
    await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "documents-sections-invoice");
    await page.emulateMedia({ media: "print" }); await shot(page, "documents-sections-invoice-print");
    const messages = await outbox({ to: email });
    const reportEmail = messages.find(message => String(message.subject).includes(" report from "));
    const invoiceEmail = messages.find(message => String(message.subject).startsWith("Your invoice from "));
    for (const message of [reportEmail, invoiceEmail]) {
      expect(message).toBeTruthy(); expect(String(message?.html)).toContain("<h3>Entry</h3>"); expect(String(message?.html)).toContain("Corrective Action:");
      expect((String(message?.html).match(/alt="before section"/g) ?? []).length).toBe(1);
    }
    expect(String(reportEmail?.html)).toContain("September 2026"); expect(String(reportEmail?.html)).not.toContain("$150.00");
    expect(messages.some(message => /<li\b[^>]*>Quoted scope only<\/li>/.test(String(message.html)))).toBe(true);
  } finally {
    must(await owner.put("/api/company/library/letters", inspection), "restore inspection template");
    must(await owner.put("/api/company/library/letters", proposal), "restore proposal template");
  }
});

test("document sends validate and remember several recipients including receipts", async ({ as }) => {
  test.setTimeout(180_000);
  const owner = await api("owner"), tag = Date.now(), emails = [`owner-${tag}@customer.e2e.test`, `office-${tag}@customer.e2e.test`];
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Recipient review", clientName: "Example Customer" }), "recipient job");
  must(await owner.patch(`/api/jobs/${job.jobId}`, { businessId: B, findings: [{ findingId: "f", category: "General", problem: "Entry condition", solution: "Restore entry", includeInReport: true, includeInQuote: true, addedAt: Date.now(), lines: [{ kind: "other", description: "Entry service", quantity: 1, unitPrice: 100 }] }] }), "recipient finding");
  const page = await as("owner"); await page.goto(`/company/jobs/${job.jobId}?tab=quote`); await settle(page);
  await page.getByLabel("Quote recipient emails").fill(emails.join(", "));
  await page.getByRole("button", { name: "Send quote", exact: true }).click();
  await expect.poll(async () => must(await owner.get(`/api/jobs/${job.jobId}?businessId=${B}`), "recipient defaults").job.documentRecipients).toEqual(emails);
  await page.goto(`/company/jobs/${job.jobId}?tab=report`); await settle(page);
  await page.getByRole("button", { name: "Mail report", exact: true }).click();
  await expect(page.getByLabel("Report recipient emails")).toHaveValue(emails.join(", "));
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  must(await owner.post(`/api/jobs/${job.jobId}/invoice`, { businessId: B }), "recipient invoice");
  await page.goto(`/company/jobs/${job.jobId}?tab=invoice`); await settle(page);
  await page.getByRole("button", { name: "Send to Customer", exact: true }).click();
  await expect(page.getByLabel("Invoice recipient emails")).toHaveValue(emails.join(", "));
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "documents-recipient-invoice");
  await page.getByRole("button", { name: "Send Invoice", exact: true }).click();
  await page.getByTestId("record-payment").click();
  const receipt = page.getByLabel("Receipt recipient emails");
  await expect(receipt).toHaveValue(emails.join(", "));
  const all = [...emails, `manager-${tag}@customer.e2e.test`]; await receipt.fill(all.join(", "));
  await shot(page, "documents-recipient-receipt");
  await page.getByRole("button", { name: "Save payment", exact: true }).click();
  await expect.poll(async () => must(await owner.get(`/api/jobs/${job.jobId}?businessId=${B}`), "receipt defaults").job.documentRecipients).toEqual(all);
  for (const email of emails) expect((await outbox({ to: email })).length).toBe(4);
  expect((await outbox({ to: all[2] })).length).toBe(1);
  await expectHealthy(page);
});
test("plain subjects keep quote and job numbers distinct", async ({ as }) => {
  test.setTimeout(150_000);
  const owner = await api("owner"), email = `copy-${Date.now()}@customer.e2e.test`;
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Entry service", clientName: "Example Customer", clientEmail: email }), "copy job");
  must(await owner.patch(`/api/jobs/${job.jobId}`, { businessId: B, findings: [{ findingId: "f", category: "General", problem: "Entry condition", solution: "Restored entry", includeInReport: true, includeInQuote: true, addedAt: Date.now(), lines: [{ kind: "other", description: "Entry service", quantity: 1, unitPrice: 100 }] }] }), "copy finding");
  const { quote } = must(await owner.post(`/api/jobs/${job.jobId}/quote`, { businessId: B }), "copy quote");
  must(await owner.post(`/api/jobs/${job.jobId}/quote/send`, { businessId: B, to: email }), "quote email");
  must(await owner.post(`/api/jobs/${job.jobId}/report/send`, { businessId: B, to: email }), "report email");
  const { invoice } = must(await owner.post(`/api/jobs/${job.jobId}/invoice`, { businessId: B }), "copy invoice");
  must(await owner.post(`/api/jobs/${job.jobId}/invoice/send`, { businessId: B, to: email }), "invoice email");
  must(await owner.post(`/api/jobs/${job.jobId}/invoice/payments`, { businessId: B, amount: invoice.total, method: "check" }), "receipt email");
  const messages = await outbox({ to: email });
  expect(messages).toHaveLength(4);
  expect(messages.some(m => String(m.subject).startsWith("Your quote from ") && String(m.subject).includes(quote.quoteId))).toBe(true);
  expect(messages.some(m => String(m.subject).startsWith("Your invoice from ") && String(m.subject).includes(invoice.invoiceId))).toBe(true);
  expect(messages.some(m => String(m.subject).startsWith("Your Entry service report from "))).toBe(true);
  expect(messages.some(m => String(m.subject).startsWith("Payment received by "))).toBe(true);
  for (const message of messages) { expect(String(message.subject).length).toBeLessThanOrEqual(90); expect(String(message.html)).toContain("display:none;max-height:0"); }
  const page = await as("owner"); await page.goto(`/company/jobs/${job.jobId}?tab=quote`); await settle(page);
  await expect(page.locator(".quote-doc")).toContainText(`${quote.quoteId} · Job ${job.jobId}`);
  await page.emulateMedia({ media: "print" });
  await shot(page, "documents-quote-numbers-print");
});
test("one finding picker and one customer version card with thirty findings", async ({ as }) => {
  test.setTimeout(180_000);
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Document controls review", clientName: "Example Customer", address: "14 Example Avenue" }), "controls job");
  const findings = Array.from({ length: 30 }, (_, i) => ({ findingId: `f-${i}`, category: "General", problem: `Finding ${i + 1}`, solution: `Service location ${i + 1}`, includeInReport: true, includeInQuote: true, addedAt: Date.now(), lines: [{ kind: "other", description: `Service ${i + 1}`, quantity: 1, unitPrice: 10 }] }));
  must(await owner.patch(`/api/jobs/${job.jobId}`, { businessId: B, findings }), "thirty findings");
  const page = await as("owner");
  await page.goto(`/company/jobs/${job.jobId}?tab=findings`);
  await settle(page);
  await expect(page.getByRole("article", { name: /^Finding \d+$/ })).toHaveCount(3);
  await page.getByRole("button", { name: "＋ Add finding", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Add a finding", exact: true });
  await expect(picker.getByLabel("One-off problem")).toBeInViewport();
  await picker.getByLabel("One-off problem").fill("Unlisted entry condition");
  await picker.getByLabel("One-off solution").fill("Restore the entry");
  await picker.getByLabel("One-off price").fill("25");
  await expect(picker.getByRole("button", { name: "Save findings", exact: true })).toHaveCount(1);
  await shot(page, "documents-finding-picker");
  await picker.getByRole("button", { name: "Save findings", exact: true }).click();
  await expect.poll(async () => (must(await owner.get(`/api/jobs/${job.jobId}?businessId=${B}`), "saved finding").job.findings ?? []).length).toBe(31);
  await shot(page, "documents-findings-bounded");
  for (const tab of ["quote", "report", "invoice"]) {
    if (tab === "report") must(await owner.post(`/api/jobs/${job.jobId}/quote/send`, { businessId: B, to: "controls@customer.e2e.test" }), "send quote for report options");
    if (tab === "invoice") must(await owner.post(`/api/jobs/${job.jobId}/invoice`, { businessId: B }), "draft invoice");
    await page.goto(`/company/jobs/${job.jobId}?tab=${tab}`); await settle(page);
    const card = page.getByRole("region", { name: "Customer version", exact: true });
    await expect(card).toHaveCount(1);
    await expect(card.getByLabel("Letterhead logo")).toBeVisible();
    if (tab === "report") {
      await card.getByText("Photos and document details", { exact: true }).click();
      await card.getByRole("switch", { name: /Include the quote/ }).click();
      await card.getByText("Photos and document details", { exact: true }).click();
    }
    {
      await expect(card.getByLabel("Customer price presentation").locator("option")).toHaveCount(5);
      await card.getByLabel("Customer price presentation").selectOption("Bundle everything");
    }
    await expect(page.getByText("What the customer sees", { exact: true })).toHaveCount(0);
    await expectHealthy(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `documents-controls-${tab}`);
  }
});
test("50 percent deposit is sent separately and credited on the final", async ({ as }) => {
  test.setTimeout(180_000);
  const owner = await api("owner");
  const email = "deposit@customer.e2e.test";
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Deposit review", address: "14 Example Avenue", clientName: "Example Customer", clientEmail: email }), "deposit job");
  must(await owner.post(`/api/jobs/${job.jobId}/quote`, { businessId: B }), "quote");
  must(await owner.patch(`/api/jobs/${job.jobId}/quote`, { businessId: B, lines: [{ lineId: "service", kind: "other", description: "Service work", quantity: 1, unitPrice: 8000 }] }), "scope");
  must(await owner.post(`/api/jobs/${job.jobId}/quote/send`, { businessId: B, to: email }), "send quote");
  must(await owner.patch(`/api/jobs/${job.jobId}/quote`, { businessId: B, status: "accepted" }), "accepted quote");
  must(await owner.post(`/api/jobs/${job.jobId}/invoice`, { businessId: B }), "final draft");
  const page = await as("owner");
  await page.goto(`/company/jobs/${job.jobId}?tab=invoice`);
  await settle(page);
  const deposits = page.getByRole("region", { name: "Deposit invoices" });
  await deposits.locator("summary").first().click();
  await deposits.getByRole("button", { name: "Request a deposit", exact: true }).click();
  await deposits.getByRole("button", { name: "Create deposit draft", exact: true }).click();
  await expect(deposits).toContainText("$4,000.00");
  await expect(deposits).toContainText("Progress billing: 50% complete");
  await deposits.getByRole("button", { name: "Send deposit", exact: true }).click();
  await expect(page.locator(".invoice-doc")).toContainText("Less deposit (INV-");
  await expect(page.locator(".invoice-doc")).toContainText("$4,000.00");
  const final = must(await owner.get(`/api/jobs/${job.jobId}/invoice?businessId=${B}`), "final").invoice;
  expect(final.total).toBe(4000);
  expect(final.depositsApplied).toHaveLength(1);
  expect(final.kind).not.toBe("deposit");
  await expectHealthy(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "documents-deposit-final");
  await page.locator(".invoice-doc").screenshot({ style: ".company-topbar,.company-nav,.company-sidebar{visibility:hidden!important}.k1-document{max-height:none!important;overflow:visible!important}", path: `test-results/screens/${test.info().project.name}/documents-final-copy.png` });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.body.classList.add("k1-print-deposit"));
  await expect(page.locator(".invoice-doc")).toBeHidden();
  await expect(page.locator(".k1-deposit-print")).toBeVisible();
  await expect(page.locator(".k1-deposit-print")).toContainText("$4,000.00");
  await shot(page, "documents-deposit-print");
  await page.evaluate(() => document.body.classList.remove("k1-print-deposit"));
  await page.emulateMedia({ media: "screen" });
});
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
  for (const phase of ["before", "after"]) {
    const photo = must(await owner.post(`/api/jobs/${job.jobId}/photos`, { businessId: B, label: `${phase} entry`, phase, thumbB64: pngBase64(64, 48, [phase === "before" ? 160 : 40, 100, 80]), fullB64: pngBase64(160, 120, [phase === "before" ? 160 : 40, 100, 80]), uploadedBy: "e2e", w: 160, h: 120 }), "completion photo");
    must(await owner.patch(`/api/jobs/${job.jobId}/photos/${photo.photoId}`, { businessId: B, includeInReport: true }), "include completion photo");
  }
  const page = await as("owner");
  await page.goto(`/company/jobs/${job.jobId}?tab=report`);
  await settle(page);
  await expectHealthy(page);
  await expect(page.locator(".report-doc")).toContainText("North entry");
  await expect(page.locator(".report-doc")).toContainText("South entry");
  await expect(page.locator(".report-doc")).toContainText("There is no charge");
  await expect(page.locator(".report-doc")).not.toContainText("$1,250.50");
  await expect(page.locator(".report-doc img[alt='before entry']")).toBeVisible();
  await expect(page.locator(".report-doc img[alt='after entry']")).toBeVisible();
  must(await owner.post(`/api/jobs/${job.jobId}/report/send`, { businessId: B, to: "completion@customer.e2e.test" }), "email completion");
  const messages = await outbox({ to: "completion@customer.e2e.test" });
  const completion = messages.find(message => String(message.html).includes("North entry"));
  expect(String(completion?.html)).not.toContain("$1,250.50");
  expect(completion).toBeTruthy();
  expect(String(completion?.html)).toContain("after entry");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "documents-completion");
  await page.locator(".report-doc").screenshot({ style: ".company-topbar,.company-nav,.company-sidebar{visibility:hidden!important}.k1-document{max-height:none!important;overflow:visible!important}", path: `test-results/screens/${test.info().project.name}/documents-completion-copy.png` });
});
test("proposal scope and T&M labor rates render on customer copies", async ({ as }) => {
  test.setTimeout(150_000);
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: "Service proposal", address: "14 Example Avenue", clientName: "Example Customer" }), "create proposal job");
  const pricing = must(await owner.get(`/api/company/library?businessId=${B}`), "read rates").library;
  must(await owner.put("/api/company/library", { businessId: B, materials: pricing.materials ?? [], documents: pricing.documents ?? [], laborRates: [...(pricing.laborRates ?? []).filter((r: { role: string }) => r.role !== "Service lead"), { role: "Service lead", rate: 75 }] }), "populate labor rate");
  must(await owner.post(`/api/jobs/${job.jobId}/quote`, { businessId: B }), "create quote");
  must(await owner.patch(`/api/jobs/${job.jobId}/quote`, { businessId: B, layout: "proposal", lines: [{ lineId: "entry", kind: "other", description: "Restore entrance surface", quantity: 1, unitPrice: 1250.5 }] }), "proposal layout");
  const page = await as("owner");
  await page.goto(`/company/jobs/${job.jobId}?tab=quote`);
  await settle(page);
  await expectHealthy(page);
  await expect(page.locator(".quote-doc li").filter({ hasText: "Restore entrance surface" })).toBeVisible();
  await expect(page.locator(".quote-doc")).toContainText("One Thousand Two Hundred Fifty Dollars and 50/100");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "documents-proposal");
  await page.locator(".quote-doc").screenshot({ style: ".company-topbar,.company-nav,.company-sidebar{visibility:hidden!important}.k1-document{max-height:none!important;overflow:visible!important}", path: `test-results/screens/${test.info().project.name}/documents-proposal-copy.png` });
  await page.getByLabel("Quote layout").selectOption("tm_authorization");
  await expect.poll(async () => must(await owner.get(`/api/jobs/${job.jobId}/quote?businessId=${B}`), "saved quote").quote.layout).toBe("tm_authorization");
  await expect(page.locator(".quote-doc").getByRole("heading", { name: "Labor rates" })).toBeVisible();
  await expect(page.locator(".quote-doc table")).toContainText("Hourly rate");
  await expect(page.locator(".quote-doc table")).toContainText("Service lead");
  await expect(page.locator(".quote-doc table")).toContainText("$75.00");
  await expect(page.locator(".quote-doc")).not.toContainText("$1,250.50");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "documents-tm");
  await page.locator(".quote-doc").screenshot({ style: ".company-topbar,.company-nav,.company-sidebar{visibility:hidden!important}.k1-document{max-height:none!important;overflow:visible!important}", path: `test-results/screens/${test.info().project.name}/documents-tm-copy.png` });
  must(await owner.post(`/api/jobs/${job.jobId}/quote/send`, { businessId: B, to: "authorization@customer.e2e.test" }), "email authorization");
  const messages = await outbox({ to: "authorization@customer.e2e.test" });
  expect(messages.some(m => String(m.html).includes("Service lead") && String(m.html).includes("$75.00") && String(m.html).includes(">Authorize</a>"))).toBe(true);
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
