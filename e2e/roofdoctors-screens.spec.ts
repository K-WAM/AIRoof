import { openHelp } from "./fixtures";
import { api, db, must, readDoc } from "../scripts/e2e/lib.cjs";
import { test, expect, settle, shot } from "./fixtures";

test("feedback stays above the calendar", async ({ as }, testInfo) => {
  const page = await as("owner");
  await page.goto("/company/calendar");
  await settle(page);
  await expect(page.getByText("Casey Sample").filter({ visible: true }).first()).toBeVisible();
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "Open menu" }).click();
  await openHelp(page);
    await page.getByRole("button", { name: "Send feedback" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "Send feedback to Luxor" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  })).toBe(true);
  await shot(page, "roofdoctors-feedback-calendar");
});


test("field name guidance and a quick press", async ({ browser }, testInfo) => {
  const owner = await api("owner");
  const { job } = must(await owner.post("/api/jobs", { businessId: "e2e-roofing", title: "Sample field visit", address: "45 Example Way", clientName: "Sample Customer" }), "job");
  const { fieldUrl } = must(await owner.post(`/api/jobs/${job.jobId}/field-qr`, { businessId: "e2e-roofing" }), "field link");
  const context = await browser.newContext({ viewport: testInfo.project.use.viewport, isMobile: testInfo.project.use.isMobile, hasTouch: testInfo.project.use.hasTouch });
  const page = await context.newPage(); await page.goto(String(fieldUrl)); await settle(page);
  const name = page.getByRole("textbox", { name: "Your name", exact: true }); await expect(name).toBeFocused();
  await expect(page.getByText("Type your name above to start").first()).toBeVisible();
  await page.getByRole("button", { name: "Go to name field" }).first().click(); await expect(name).toBeFocused();
  await shot(page, "roofdoctors-field-name");
  await name.fill("Sample Worker");
  const mic = page.getByTestId("note-mic"); await mic.click();
  await expect(page.getByText("Keep holding while you talk, then let go to send")).toBeVisible();
  await shot(page, "roofdoctors-field-hold"); await context.close();
});

test("booked request has decline and saves corrected details", async ({ as }, testInfo) => {
  const id = `k2-edit-${testInfo.project.name}`; const startTime = Date.now() + 86400000;
  await db().doc(`businesses/e2e-roofing/appointments/${id}`).set({ appointmentId: id, businessId: "e2e-roofing", callerName: "Example Caller", callerPhone: "5551234567", callerEmail: "heard@example.test", address: "1 Example Road", serviceType: "Inspection", status: "requested", pendingConfirmation: true, startTime, endTime: startTime + 3600000, createdAt: Date.now(), updatedAt: Date.now() });
  const page = await as("owner"); await page.goto("/company/pipeline?tab=appointments"); await settle(page);
  await page.getByRole("button", { name: /^Booked/ }).click();
  const card = page.locator(`#appt-${id}`); await expect(card).toBeVisible(); await expect(card.getByRole("button", { name: "Decline", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Edit details" }).click();
  await card.getByLabel("Email", { exact: true }).fill("correct@example.test"); await card.getByRole("button", { name: "Save details" }).click();
  await expect.poll(async () => (await readDoc(`businesses/e2e-roofing/appointments/${id}`))?.callerEmail).toBe("correct@example.test");
  await card.getByRole("button", { name: "Edit details" }).click(); await card.getByLabel("Email", { exact: true }).fill("again@example.test"); await card.getByRole("button", { name: "Save details" }).click();
  await expect.poll(async () => (await readDoc(`businesses/e2e-roofing/appointments/${id}`))?.asHeard?.email).toBe("heard@example.test");
  await shot(page, "roofdoctors-pipeline");
});

test("finances loads invoices, removes filters and exports CSV", async ({ as }) => {
  const page = await as("owner"); await page.goto("/company/finances"); await settle(page); await expect(page.getByRole("heading", { name: "Finances" })).toBeVisible(); await shot(page, "roofdoctors-finances");
  await page.getByRole("button", { name: "Filters", exact: true }).click(); await page.getByRole("textbox", { name: "Customer" }).fill("Sample Customer 1");
  const chip = page.getByRole("button", { name: /Sample Customer 1/ }); await expect(chip).toBeVisible(); await chip.click();
  await expect(page.getByRole("heading", { name: "Invoices", exact: true })).toBeVisible(); const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export CSV" }).click(); expect((await download).suggestedFilename()).toBe("invoices.csv");
});

test("payroll shows seeded hours", async ({ as }) => {
  const page = await as("owner"); await page.goto("/company/payroll"); await settle(page); await expect(page.getByRole("heading", { name: "Payroll" })).toBeVisible(); await shot(page, "roofdoctors-payroll"); await expect(page.getByText("Sample Worker")).toBeVisible();
});

test("other business has no showcase access", async ({ as }) => {
  const other = await api("emptyOwner");
  expect((await other.get("/api/company/finance")).status).toBe(404);
  expect((await other.get("/api/company/payroll?periodStart=2026-11-01&periodEnd=2026-11-07")).status).toBe(404);
  const page = await as("emptyOwner"); await page.goto("/company/dashboard"); await settle(page);
  // "Finances" in the menu is the Invoices screen for a business with billing; the showcase-only
  // routes must not be linked from the menu, nor from the Finances section switch on /company/billing.
  await expect(page.locator('a[href^="/company/finances"]')).toHaveCount(0);
  await expect(page.locator('a[href^="/company/payroll"]')).toHaveCount(0);
  await page.goto("/company/billing"); await settle(page);
  await expect(page.locator('a[href^="/company/finances"]')).toHaveCount(0);
  await expect(page.locator('a[href^="/company/payroll"]')).toHaveCount(0);
});
