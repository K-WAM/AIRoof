import { admin, db, must, api } from "../scripts/e2e/lib.cjs";
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
