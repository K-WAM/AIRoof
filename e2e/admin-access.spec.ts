import { api, db, must, pngBase64, simulateCall } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, shot, test } from "./fixtures";

for (const path of ["/admin", "/admin/usage", "/hub/demo"]) {
  test(`client owner cannot render ${path}`, async ({ as }) => {
    const page = await as("owner");
    const response = await page.goto(path);
    await expect(page).toHaveURL(/\/company\/dashboard$/);
    await expect(page.locator(".company-shell")).toBeVisible();
    await expect(page.locator(".admin-shell")).toHaveCount(0);
    // Also inspect the server response: a client redirect must not hide a leaked shell.
    expect(await response!.text()).not.toContain('class="admin-shell"');
    await shot(page, `access-${path.replaceAll("/", "-")}`);
    await expectHealthy(page);
  });
}

test("roofing owner cannot read another seeded tenant's records by id", async () => {
  const businessId = "e2e-dental";
  const id = `access-${crypto.randomUUID()}`;
  const admin = await api("superadmin");
  const owner = await api("owner");
  // Emulator-only fixtures: dental has no job-create UI, but must still isolate job records.
  await db().doc(`businesses/${businessId}/jobs/${id}`).set({ jobId: id, businessId, title: "Isolation fixture", status: "open", createdAt: Date.now() });
  const { customer } = must(await admin.post("/api/company/customers", { businessId, name: id }), "foreign customer");
  must(await admin.post(`/api/jobs/${id}/photos`, { businessId, label: "Isolation fixture", thumbB64: pngBase64(), fullB64: pngBase64(), uploadedBy: "e2e", w: 64, h: 48 }), "foreign photo");
  const { photos } = must(await admin.get(`/api/jobs/${id}/photos?businessId=${businessId}`), "foreign photos");
  expect(photos.length).toBeGreaterThan(0);
  const call = await simulateCall({ tenant: "dental" });
  const paths = [
    `/api/jobs/${id}`,
    `/api/calls/${call.callId}`,
    `/api/company/customers/${customer.customerId}`,
    `/api/jobs/${id}/photos/${photos[0].photoId}`,
  ];
  for (const path of paths) {
    // Prove the target really exists; a probe of a made-up ID proves nothing.
    must(await admin.get(`${path}?businessId=${businessId}`), "existing foreign record");
    // Naming the other tenant is refused outright.
    expect([403, 404], path).toContain((await owner.get(`${path}?businessId=${businessId}`)).status);
    // Naming its own tenant may legitimately hit its OWN record (customer ids like C-1000 are numbered per tenant),
    // but must never return the other tenant's record.
    const own = await owner.get(`${path}?businessId=e2e-roofing`);
    // Every foreign fixture carries `id` (job id, customer name, photo's job) or the dental call id.
    if (own.status === 200) expect(own.text, path).not.toMatch(new RegExp(`${id}|${call.callId}`));
    else expect([403, 404], path).toContain(own.status);
  }
});
