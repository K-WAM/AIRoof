import { test, expect, expectHealthy, shot } from "./fixtures";
import { api, must, readDoc, simulateCall, outbox } from "../scripts/e2e/lib.cjs";

test("Demo Studio changes the next greeting and office inbox without removing a call", async ({ as }) => {
  const operator = await api("superadmin");
  const original = must(await operator.get("/api/admin/demo-customize"), "current demo");
  const call = await simulateCall({ tenant: "demo" });
  const page = await as("superadmin");
  await page.goto("/hub/demo");
  const current = page.getByRole("region", { name: /^Currently Answering as/ });
  await expect(current).toBeVisible();
  try {
    await current.getByRole("button", { name: "Change Name & Office Email", exact: true }).click();
    await current.getByLabel("Business name callers hear").fill("RoofDoctors South Florida");
    await current.getByLabel("Office notification email").fill("roofdoctors-demo@example.test");
    await shot(page, "demo-greeting-edit");
    await current.getByRole("button", { name: "Save Demo Details", exact: true }).click();
    await expect(current.getByRole("status")).toContainText("Existing bookings and jobs are kept");
    await expect(current).toContainText("Thanks for calling RoofDoctors South Florida, this is");
    await expect(current).toContainText("roofdoctors-demo@example.test");
    expect(await readDoc(`businesses/demo-roofing/calls/${call.callId}`)).toMatchObject({ status: "ended" });
    const denied = await api("owner");
    expect((await denied.patch("/api/admin/demo-customize", { companyName: "Unauthorized" })).status).toBe(403);
    await expectHealthy(page);
    await shot(page, "demo-greeting-saved");
  } finally {
    must(await operator.patch("/api/admin/demo-customize", { companyName: original.businessName, email: original.notificationEmail }), "restore local demo identity");
  }
});

test("office request email has no call ID and identifies the confirmation action", async ({ page }, testInfo) => {
  const stamp = Date.now();
  const caller = `Email review ${stamp}`;
  const day = testInfo.project.name === "phone" ? "24" : "23";
  const call = await simulateCall({ from: `+1305555${String(stamp).slice(-4)}`, tools: [["bookAppointment", {
    callerName: caller, callerEmail: "demo-customer@example.test", serviceType: "Roof inspection",
    address: "317 Palm Way, Boca Raton, 33432", startTime: `2030-07-${day}T10:00:00-04:00`, endTime: `2030-07-${day}T11:00:00-04:00`,
  }]] });
  expect(call.toolResults[0].result.result).toContain("BOOKED:");
  const messages = await outbox({ subject: caller });
  const office = messages.find((message) => String(message.html || "").includes("New Appointment Request for Your Office"));
  expect(office).toBeTruthy();
  expect(office!.html).not.toContain(call.callId);
  expect(office!.html).not.toContain("Call ID:");
  expect(office!.html).toContain("Confirm &amp; email");
  await page.setContent(office!.html);
  await expect(page.getByRole("heading", { name: "New Appointment Request for Your Office" })).toBeVisible();
  await expectHealthy(page);
  await shot(page, "demo-office-email");
});
