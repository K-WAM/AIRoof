import type { Page } from "@playwright/test";
import { test, expect, settle, shot, expectHealthy } from "./fixtures";
import { simulateCall } from "../scripts/e2e/lib.cjs";

const BUSINESS_ID = "e2e-roofing";
const stamp = () => Date.now().toString(36);

async function api(page: Page, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  if (!page.url().startsWith("http")) { await page.goto("/company/dashboard"); await settle(page); }
  return page.evaluate(async ({ method, path, body }) => {
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
  }, { method, path, body });
}

function nextWeek(dayOffset: number, hour: number) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + 7 + dayOffset);
  monday.setHours(hour, 0, 0, 0);
  const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  return { key, local: `${key}T${String(hour).padStart(2, "0")}:00`, ms: monday.getTime() };
}

async function dragTo(page: Page, sourceTestId: string, targetTestId: string) {
  const source = page.getByTestId(sourceTestId);
  const target = page.getByTestId(targetTestId);
  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  if (!from) throw new Error("drag source not on screen");
  await source.hover();
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 10 });
  await page.waitForTimeout(150);
  await target.hover();
  await page.waitForTimeout(250);
  await page.mouse.up();
}

test("call → booked → inspector schedule follows the real workflow", async ({ as }, testInfo) => {
  const owner = await as("owner");
  const id = stamp();
  const firstName = `Carla Flow ${id}`;
  const secondName = `Noah Auto ${id}`;
  const inspectorName = `Inspector Dominic ${id}`;
  const first = nextWeek(0, 11);
  const second = nextWeek(1, 10);
  const moved = nextWeek(2, 11);

  await owner.goto("/company/dashboard");
  await settle(owner);
  const existingCrews = await api(owner, "GET", `/api/company/crews?businessId=${BUSINESS_ID}`);
  const staleInspectors = ((existingCrews.data.crews ?? []) as Array<{ crewId: string; name: string }>)
    .filter((crew) => crew.name.startsWith("Inspector Dominic "));
  for (const crew of staleInspectors) {
    await api(owner, "DELETE", `/api/company/crews?businessId=${BUSINESS_ID}&crewId=${crew.crewId}`);
  }
  await api(owner, "PATCH", "/api/company/team/e2e-staff", { businessId: BUSINESS_ID, trade: null, crewId: null });
  const existingAppointments = await api(owner, "GET", `/api/businesses/${BUSINESS_ID}/appointments?limit=500`);
  const staleAppointments = ((existingAppointments.data.appointments ?? []) as Array<{ appointmentId: string; callerName?: string }>)
    .filter((appointment) => appointment.callerName?.startsWith("Carla Flow ") || appointment.callerName?.startsWith("Noah Auto "));
  for (const appointment of staleAppointments) {
    await api(owner, "PATCH", `/api/businesses/${BUSINESS_ID}/appointments/${appointment.appointmentId}`, { businessId: BUSINESS_ID, status: "cancelled" });
  }

  await simulateCall({
    tenant: "roofing",
    from: `+1555${String(Date.now()).slice(-7)}`,
    summary: "Caller needs a roof inspection and shared the front gate code.",
    transcript: [["user", "Please book an inspection. The front gate code is 1010."]],
    tools: [["bookAppointment", { name: firstName, phone: "+15550101999", email: "carla@example.com", textOk: true, address: "101 Palm Ave, Miami, FL", serviceType: "Roof inspection", notes: "Access: gate 1010\nURGENT: active leak", startTime: first.local }]],
  });

  if (testInfo.project.name === "phone") {
    // T-159: no icon-only shortcuts — a labelled "New" and a labelled "Menu" that lists every route in workflow order.
    await expect(owner.getByRole("navigation", { name: "Mobile workflow shortcuts" })).toHaveCount(0);
    await expect(owner.getByRole("button", { name: /New/ }).first()).toBeVisible();
    await owner.getByRole("button", { name: "Open menu" }).click();
    const menu = owner.locator("#company-mobile-nav");
    await expect(menu).toBeVisible();
    const menuLabels = (await menu.getByRole("link").allTextContents()).map((label) => label.trim());
    expect(menuLabels.filter((label) => ["Dashboard", "Calls", "Pipeline", "Calendar", "Jobs", "Field", "Customers", "Library"].includes(label))).toEqual(["Dashboard", "Calls", "Pipeline", "Calendar", "Jobs", "Field", "Customers", "Library"]);
    await owner.keyboard.press("Escape");
  } else {
    const nav = owner.locator('nav[aria-label="Company navigation"]').first();
    const labels = await nav.getByRole("link").allTextContents();
    expect(labels.filter((label) => ["Dashboard", "Calls", "Pipeline", "Calendar", "Jobs", "Field", "Customers", "Library"].includes(label.trim())).map((label) => label.trim())).toEqual(["Dashboard", "Calls", "Pipeline", "Calendar", "Jobs", "Field", "Customers", "Library"]);
  }

  await owner.goto("/company/pipeline");
  await settle(owner);
  await expect(owner.getByRole("button", { name: /Booked/ })).toHaveAttribute("aria-pressed", "true");
  const firstBooking = owner.locator(".appt-card").filter({ hasText: firstName });
  await expect(firstBooking).toBeVisible();
  // The card renders its details once for phone and once for desktop (one is hidden) — check the one on screen.
  // On a phone the booking details are inside the card's one "More" menu (T-182, 2026-10-04).
  if (testInfo.project.name === "phone") await firstBooking.getByText("More", { exact: true }).filter({ visible: true }).first().click();
  await expect(firstBooking.getByText("Access: gate 1010", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(firstBooking.getByText("From the call", { exact: true }).filter({ visible: true }).first()).toBeVisible();

  const created = await api(owner, "POST", "/api/company/crews", { businessId: BUSINESS_ID, name: inspectorName, email: "dominic@inspector.e2e.test", kind: "inspector" });
  expect(created.ok, JSON.stringify(created.data)).toBeTruthy();
  const inspectorId = (created.data.crew as { crewId: string }).crewId;
  const member = await api(owner, "PATCH", "/api/company/team/e2e-staff", { businessId: BUSINESS_ID, trade: "inspector", crewId: inspectorId });
  expect(member.ok, JSON.stringify(member.data)).toBeTruthy();

  await simulateCall({
    tenant: "roofing",
    from: `+1556${String(Date.now()).slice(-7)}`,
    summary: "Caller booked a routine inspection.",
    transcript: [["user", "Book the next inspection for me."]],
    tools: [["bookAppointment", { name: secondName, phone: "+15550101888", email: "noah@example.com", textOk: true, address: "202 Bay Rd, Miami, FL", serviceType: "Roof inspection", notes: "Access: side gate", startTime: second.local }]],
  });

  const block = await api(owner, "POST", "/api/company/time-blocks", { businessId: BUSINESS_ID, crewId: inspectorId, label: "Materials pickup", startTime: first.ms + 2 * 3600000, endTime: first.ms + 3 * 3600000 });
  expect(block.ok, JSON.stringify(block.data)).toBeTruthy();
  const blockId = (block.data.block as { blockId: string }).blockId;

  if (testInfo.project.name !== "phone") {
    await owner.goto("/company/calendar");
    await settle(owner);
    await owner.getByRole("button", { name: "Next week" }).click();
    await settle(owner);
    const firstBookingData = await api(owner, "GET", `/api/businesses/${BUSINESS_ID}/appointments?limit=500`);
    const firstAppointment = ((firstBookingData.data.appointments ?? []) as Array<{ appointmentId: string; callerName?: string; startTime: number }>)
      .find((appointment) => appointment.callerName === firstName);
    expect(firstAppointment).toBeTruthy();
    owner.once("dialog", (dialog) => dialog.accept());
    // T-160: an unassigned booking shows once, in the Phone bookings row — drag it from there.
    await dragTo(owner, `phone-booking-${firstAppointment!.appointmentId}`, `calendar-cell-${inspectorId}-${moved.key}`);
    await expect(owner.getByTestId(`calendar-cell-${inspectorId}-${moved.key}`).getByText(firstName, { exact: true })).toBeVisible();
    await expect(owner.getByTestId(`calendar-cell-${inspectorId}-${second.key}`).getByText(secondName, { exact: true })).toBeVisible();

    await owner.reload(); await settle(owner); await owner.getByRole("button", { name: "Next week" }).click(); await settle(owner);
    await expect(owner.getByText("Materials pickup", { exact: true })).toBeVisible();
    await expectHealthy(owner, { allowOverflow: true });
    await shot(owner, "call-flow-calendar-inspectors");
  }

  const staff = await as("staff");
  await staff.goto("/company/field");
  await settle(staff);
  await expect(staff.getByRole("heading", { name: "My schedule" })).toBeVisible();
  await expect(staff.getByText(secondName, { exact: false })).toBeVisible();
  await expect(staff.getByText("Materials pickup", { exact: true })).toBeVisible();
  await expectHealthy(staff, { allowOverflow: true });
  await shot(staff, "call-flow-field-my-schedule");

  await api(owner, "PATCH", "/api/company/team/e2e-staff", { businessId: BUSINESS_ID, trade: null, crewId: null });
  await api(owner, "DELETE", `/api/company/time-blocks?businessId=${BUSINESS_ID}&blockId=${blockId}`);
  await api(owner, "DELETE", `/api/company/crews?businessId=${BUSINESS_ID}&crewId=${inspectorId}`);
});
