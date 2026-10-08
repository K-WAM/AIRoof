// Products per client (owner, 2026-10-08) + Billing without Stripe.
//  1. The superadmin turns AI calls off for a client: the client's menu loses Calls/Pipeline, the Dashboard stops
//     asking for calls, and the calls API refuses them — then it's turned back on.
//  2. Billing: the owner sets "Getting paid", sends an invoice (How to pay is in the email), records a partial and a
//     final payment (receipts captured), and the Billing screen shows the money.
import { FieldValue } from "firebase-admin/firestore";
import { api, db, must, outbox } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, settle, shot, test } from "./fixtures";

const EMPTY = "e2e-empty";
const B = "e2e-roofing";

test.afterAll(async () => {
  // Leave the shared tenants exactly as seeded for every other spec.
  const admin = await api("superadmin");
  await admin.post(`/api/admin/businesses/${EMPTY}/products`, { products: { calls: true, field: true, billing: true } }).catch(() => {});
  // Clear the test's upgrade request so the next run starts clean.
  await db().collection("businesses").doc(EMPTY).update({ upgradeRequests: FieldValue.delete() }).catch(() => {});
});

test("superadmin switches a client to field input + billing only, and the client gets exactly that", async ({ as }) => {
  test.setTimeout(150_000);
  const adminPage = await as("superadmin");
  await adminPage.goto(`/admin/businesses/${EMPTY}/config#products`);
  await settle(adminPage);
  const calls = adminPage.getByTestId("product-calls");
  await expect(calls).toBeChecked();
  await calls.uncheck();
  await expect(adminPage.getByText("Saved. The client sees the change")).toBeVisible();
  await expect(adminPage.getByText("2 of 3 on")).toBeVisible();
  await adminPage.getByTestId("products-panel").scrollIntoViewIfNeeded();
  await shot(adminPage, "admin-products");

  // Server: the calls API is refused for this client; jobs still work.
  const owner = await api("emptyOwner");
  const refused = await owner.get(`/api/businesses/${EMPTY}/calls?countOnly=1`);
  expect(refused.status).toBe(403);
  expect(refused.json?.product).toBe("calls");
  expect((await owner.get(`/api/jobs?businessId=${EMPTY}`)).status).toBe(200);

  // Screens: no Calls/Pipeline, a Billing tab, and the dashboard loads without asking for calls.
  const page = await as("emptyOwner");
  const callRequests: string[] = [];
  page.on("request", (r) => { if (/\/api\/businesses\/[^/]+\/(calls|leads|appointments|agent-actions)/.test(r.url())) callRequests.push(r.url()); });
  await page.goto("/company/dashboard");
  await settle(page, 1200);
  await expectHealthy(page);
  if (test.info().project.name === "phone") await page.getByRole("button", { name: /menu/i }).first().click().catch(() => {});
  await expect(page.getByRole("link", { name: "Billing", exact: true }).first()).toBeVisible();
  // Not bought = still there, greyed with a lock (owner: "so that we can target conversion").
  const lockedCalls = page.getByRole("link", { name: "Calls — not in your plan" }).first();
  await expect(lockedCalls).toBeVisible();
  await expect(page.getByRole("link", { name: "Pipeline — not in your plan" }).first()).toBeVisible();
  await expect(page.getByText("Dashboard data could not be loaded")).toHaveCount(0);
  await shot(page, "dashboard-field-billing-only");
  expect(callRequests, "the dashboard asked for calls data this client doesn't have").toEqual([]);

  // The locked tab opens what it adds and one button that tells Luxor; the ask shows up on the superadmin's panel.
  await lockedCalls.click();
  await expect(page).toHaveURL(/\/company\/upgrade\?module=calls/);
  await expect(page.getByRole("heading", { name: "AI calls & booking" })).toBeVisible();
  await expect(page.getByRole("link", { name: "connect@luxordev.com" })).toBeVisible();
  await shot(page, "upgrade-calls");
  await page.getByTestId("upgrade-ask").click();
  await expect(page.getByTestId("upgrade-sent")).toBeVisible();
  await expect.poll(async () => (await outbox({ to: "connect@luxordev.com", subject: "[Upgrade request]" })).length, { timeout: 15_000 }).toBeGreaterThan(0);
  await adminPage.reload();
  await settle(adminPage);
  await expect(adminPage.getByTestId("product-request-calls")).toContainText("owner@empty.e2e.test");

  // A direct visit to a locked screen lands on its upgrade page, not an error.
  await page.goto("/company/pipeline");
  await settle(page, 800);
  await expect(page).toHaveURL(/\/company\/upgrade\?module=calls/);

  // Turning it back on restores everything.
  await adminPage.getByTestId("product-calls").check();
  await expect(adminPage.getByText("3 of 3 on")).toBeVisible();
  expect((await owner.get(`/api/businesses/${EMPTY}/calls?countOnly=1`)).status).toBe(200);
});

test("billing without Stripe: payment details on the invoice, partial + final payment, receipts, Billing screen", async ({ as }) => {
  test.setTimeout(180_000);
  const owner = await api("owner");
  const tag = Date.now().toString(36);
  const email = `billing-${tag}@customer.e2e.test`;

  must(await owner.put("/api/company/settings/billing", { businessId: B, payInstructions: `Zelle: pay@e2e-roofing.test ${tag}`, payLink: "https://pay.e2e-roofing.test/invoice", remindersOn: true, dueDays: 15 }), "save payment details");
  expect((await owner.put("/api/company/settings/billing", { businessId: B, payLink: "javascript:alert(1)" })).status).toBe(400);
  expect((await (await api("staff")).put("/api/company/settings/billing", { businessId: B, payInstructions: "Send it to me" })).status).toBe(403);

  const { job } = must(await owner.post("/api/jobs", { businessId: B, title: `Billing ${tag}`, address: "5 Ledger Lane, Miami, FL", clientName: "Bill Payer", clientEmail: email }), "create job");
  const jobId = job.jobId as string;
  must(await owner.post(`/api/jobs/${jobId}/invoice`, { businessId: B }), "create invoice");
  must(await owner.patch(`/api/jobs/${jobId}/invoice`, { businessId: B, other: [{ lineId: "o1", description: "Roof repair", amount: 500 }], taxRate: 0 }), "price invoice");
  must(await owner.post(`/api/jobs/${jobId}/invoice/send`, { businessId: B, to: email }), "send invoice");
  await expect.poll(async () => (await outbox({ to: email, subject: "[Invoice]" })).length, { timeout: 20_000 }).toBeGreaterThan(0);
  const invoiceMail = (await outbox({ to: email, subject: "[Invoice]" }))[0];
  expect(String(invoiceMail.html)).toContain("How to pay");
  expect(String(invoiceMail.html)).toContain(`pay@e2e-roofing.test ${tag}`);
  expect(String(invoiceMail.html)).toContain("https://pay.e2e-roofing.test/invoice");

  const page = await as("owner");
  await page.goto(`/company/jobs/${jobId}?tab=invoice`);
  await settle(page, 1000);
  await expectHealthy(page);
  await expect(page.getByTestId("invoice-balance")).toHaveText("$500.00");
  await expect(page.getByTestId("how-to-pay")).toBeVisible();
  await page.getByTestId("record-payment").click();
  const amount = page.getByRole("textbox", { name: "Amount received" });
  await amount.fill("200");
  await page.getByLabel("Paid by").selectOption("zelle");
  await shot(page, "record-payment-form");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText(/\$200\.00 recorded\. \$300\.00 still owed\. Receipt emailed/)).toBeVisible();
  await expect(page.getByTestId("invoice-balance")).toHaveText("$300.00");

  await page.getByTestId("record-payment").click();
  await expect(amount).toHaveValue("300");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText(/Paid in full\./).first()).toBeVisible();
  await page.getByTestId("invoice-payments").scrollIntoViewIfNeeded();
  await shot(page, "invoice-paid-in-full");
  await expect.poll(async () => (await outbox({ to: email, subject: "[Receipt]" })).length, { timeout: 20_000 }).toBe(2);

  await page.goto("/company/billing");
  await settle(page, 1000);
  await expectHealthy(page);
  await expect(page.getByTestId("billing-totals")).toBeVisible();
  await expect(page.getByTestId("billing-paid").getByText(`Bill Payer`).first()).toBeVisible();
  await shot(page, "billing-screen");
});
