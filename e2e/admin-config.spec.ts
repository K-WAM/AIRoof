import { FieldValue } from "firebase-admin/firestore";
import { admin, db, must, api, outbox } from "../scripts/e2e/lib.cjs";
import { test, expect, expectHealthy, settle, shot } from "./fixtures";

test("client login refuses account takeover and confirms an explicit password reset", async ({ as }, testInfo) => {
  const businessId = "e2e-roofpros", email = `login-${Date.now()}@customer.e2e.test`;
  const page = await as("superadmin");
  let createdUid: string | undefined;
  try {
    await page.goto(`/admin/businesses/${businessId}/config`); await settle(page);
    const card = page.locator("#login-provision"), input = card.getByRole("textbox");
    await expect(card).toContainText("Don't use your own address.");
    for (const protectedEmail of ["superadmin@e2e.test", "owner@roofing.e2e.test"]) {
      await input.fill(protectedEmail); await card.getByRole("button", { name: "Provision Login", exact: true }).click();
      await expect(card.getByRole("alert")).toContainText(/cannot|another business/i);
    }
    await input.fill(email); await card.getByRole("button", { name: "Provision Login", exact: true }).click();
    await expect(card).toContainText("Login ready");
    createdUid = (await admin.auth().getUserByEmail(email)).uid;
    const ref = db().collection("businessUsers").doc(createdUid), before = (await ref.get()).data();
    await card.getByRole("button", { name: "Provision Login", exact: true }).click();
    await expect(card.getByRole("alert")).toContainText("Reset password");
    await card.getByRole("button", { name: "Reset password", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Reset client password" });
    await expect(dialog).toContainText(email);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await card.getByRole("button", { name: "Reset password", exact: true }).click();
    await dialog.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(card).toContainText("Login ready");
    expect((await ref.get()).data()).toEqual(before);
    await card.scrollIntoViewIfNeeded(); await shot(page, "admin-config-client-login");
    await card.screenshot({ path: `test-results/screens/${testInfo.project.name}/admin-config-login-card.png` });
    await expectHealthy(page);
    const operator = await api("superadmin");
    must(await operator.get(`/api/admin/businesses/${businessId}/config`), "platform login still works");
  } finally {
    if (createdUid) { await db().collection("businessUsers").doc(createdUid).delete(); await admin.auth().deleteUser(createdUid); }
  }
});


test("config puts ElevenLabs first, preserves legacy data, switches document look and opens an editable invoice draft", async ({ as }, testInfo) => {
  test.setTimeout(240_000);
  const businessId = "e2e-roofpros", ref = db().collection("businesses").doc(businessId), original = (await ref.get()).data()!;
  const operator = await api("superadmin"); let invoiceId: string | undefined;
  try {
    await ref.update({ voiceProvider: FieldValue.delete(), calendarProvider: "mock", vapiAssistantId: "legacy-agent", vapiPhoneNumberId: "legacy-phone", voice: { es: { provider: "cartesia", voiceId: "kept-voice" } }, billing: { ...original.billing, planName: "Sample monthly service", monthlyAmount: 120 } });
    const page = await as("superadmin"); await page.goto(`/admin/businesses/${businessId}/config`); await settle(page);
    await expect(page.getByRole("combobox", { name: "Phone provider", exact: true })).toHaveValue("");
    await expect(page.getByRole("combobox", { name: "Phone provider", exact: true }).locator("option:checked")).toHaveText("Not set — choose ElevenLabs");
    await expect(page.getByLabel("ElevenLabs agent ID", { exact: true })).toBeVisible();
    const legacy = page.getByTestId("legacy-vapi-settings"); await expect(legacy).not.toHaveAttribute("open", "");
    await expect(page.getByLabel("Vapi assistant ID", { exact: true })).toBeHidden();
    await expect(page.getByLabel("Calendar provider", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Logo URL (HTTPS)")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open Library → Branding" })).toHaveAttribute("href", `/company/library?section=branding&preview=${businessId}`);
    await page.getByLabel("Document look", { exact: true }).selectOption("classic");
    const saved = page.waitForResponse(r => r.url().endsWith(`/api/admin/businesses/${businessId}/config`) && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Save config", exact: true }).click(); expect((await saved).status()).toBe(200);
    const config = must(await operator.get(`/api/admin/businesses/${businessId}/config`), "saved config").business;
    expect(config.documentStyle).toBe("classic"); expect(config.voiceProvider).toBeUndefined(); expect(config.calendarProvider).toBe("mock"); expect(config.logoUrl).toEqual(original.logoUrl);
    expect(config.vapiAssistantId).toBe("legacy-agent"); expect(config.voice.es.voiceId).toBe("kept-voice");
    await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "admin-config-polished");
    await page.locator("#branding").screenshot({ path: `test-results/screens/${testInfo.project.name}/admin-config-branding.png` });
    await legacy.locator("summary").click(); await expect(page.getByLabel("Vapi assistant ID", { exact: true })).toHaveValue("legacy-agent"); await legacy.locator("summary").click();
    const generated = page.waitForResponse(r => r.url().endsWith("/api/admin/invoices") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Generate invoice", exact: true }).click(); const data = await (await generated).json(); invoiceId = data.invoice.invoiceId;
    await page.waitForURL(/\/admin\/invoices\?invoice=LX-/); await settle(page);
    const description = page.getByPlaceholder("AI receptionist — monthly subscription").first(); await expect(description).toHaveValue("Sample monthly service");
    await description.fill("Reviewed monthly service"); await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect.poll(async () => (await db().collection("luxorInvoices").doc(invoiceId!).get()).data()?.lineItems[0].description).toBe("Reviewed monthly service");
    const draft = (await db().collection("luxorInvoices").doc(invoiceId!).get()).data()!; expect(draft.status).toBe("draft"); expect(draft.sentAt).toBeUndefined();
    expect((await outbox({ to: original.notificationEmail })).filter(m => String(m.html).includes(invoiceId!))).toHaveLength(0);
    for (const target of [page.locator("#invoice-print").getByText(invoiceId!, { exact: true }), page.locator("#invoice-print").getByRole("columnheader", { name: "Total", exact: true })]) {
      expect(await target.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= document.documentElement.clientWidth; })).toBe(true);
    }
    await shot(page, "admin-config-generated-draft"); await expectHealthy(page);
    await ref.update({ calendarProvider: "google" }); await page.goto(`/admin/businesses/${businessId}/config`); await settle(page);
    await expect(page.getByLabel("Calendar provider", { exact: true })).toHaveValue("google");
    await page.getByRole("button", { name: "View as", exact: true }).click();
    const officeChoice = page.getByRole("dialog", { name: /View as/ }).getByRole("button", { name: "Office staff", exact: true });
    await expect(officeChoice).toBeVisible({ timeout: 60_000 }); // cold Next dev API compilation
    await officeChoice.click();
    await page.waitForURL(/\/company\/dashboard/); await expect(page.getByTestId("view-as-banner")).toContainText("read-only");
    await page.getByTestId("view-as-banner").getByRole("button", { name: "Exit", exact: true }).click(); await page.waitForURL(/\/admin\/businesses$/);
  } finally { await ref.set(original); if (invoiceId) await db().collection("luxorInvoices").doc(invoiceId).delete(); }
});
