import { type Page } from "@playwright/test";
import { api, must, outbox, simulateCall } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, shot, test } from "./fixtures";

function nextTuesday() {
  const day = new Date();
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7) + 8);
  return day;
}
const dateKey = (day: Date) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

async function showDay(page: Page, day: Date, mobile: boolean) {
  await page.goto("/company/calendar");
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  if (mobile) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(day); target.setHours(0, 0, 0, 0);
    const days = Math.round((target.getTime() - today.getTime()) / 86400000);
    for (let i = 0; i < days; i++) await page.getByRole("button", { name: "Next day", exact: true }).click();
  } else await page.getByRole("button", { name: "Next week", exact: true }).click();
}

test("scheduled job: reschedule, notify, undo, unschedule, and refuse overlap", async ({ as, isMobile }) => {
  const owner = await api("owner");
  const B = "e2e-roofing", tag = Date.now().toString(36), day = nextTuesday();
  const crew = must(await owner.post("/api/company/crews", { businessId: B, name: `Smooth ${tag}`, email: `smooth-${tag}@example.test` })).crew;
  const other = must(await owner.post("/api/company/crews", { businessId: B, name: `Other ${tag}`, email: `other-${tag}@example.test` })).crew;
  const job = must(await owner.post("/api/jobs", { businessId: B, title: `Move ${tag}` })).job;
  const nextDay = new Date(day); nextDay.setDate(day.getDate() + 1);
  const slots = must(await owner.get(`/api/company/crews/open-times?businessId=${B}&crewId=${crew.crewId}&day=${dateKey(day)}&durationMin=60`)).starts as number[];
  const nextSlots = must(await owner.get(`/api/company/crews/open-times?businessId=${B}&crewId=${other.crewId}&day=${dateKey(nextDay)}&durationMin=60`)).starts as number[];
  expect(slots.length).toBeGreaterThan(0); expect(nextSlots.length).toBeGreaterThan(0);
  const start = slots[0], moved = nextSlots[2];
  must(await owner.post(`/api/jobs/${job.jobId}/assign`, { businessId: B, crewId: crew.crewId, scheduledStart: start, scheduledEnd: start + 3600000, crewConfirmed: true, notify: false }));
  const page = await as("owner");
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 1300 });
  await showDay(page, day, isMobile);
  if (isMobile) {
    const trigger = page.getByTestId(`calendar-agenda-job-${job.jobId}`).locator(".calendar-item-title");
    await expect(trigger).toBeVisible();
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await trigger.click();
  }
  else {
    const source = page.getByTestId(`calendar-cell-${crew.crewId}-${dateKey(day)}`).getByText(job.title, { exact: true });
    const target = page.getByTestId(`calendar-cell-${other.crewId}-${dateKey(nextDay)}`);
    await target.scrollIntoViewIfNeeded(); await source.scrollIntoViewIfNeeded();
    const from = await source.boundingBox(), to = await target.boundingBox();
    expect(from && to).toBeTruthy();
    await page.mouse.move(from!.x + 10, from!.y + 6); await page.mouse.down();
    await page.mouse.move(from!.x + 30, from!.y + 10, { steps: 5 });
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 15 });
    await page.mouse.up();
  }
  const sheet = page.getByRole("dialog", { name: job.title });
  await expect(sheet.getByRole("checkbox")).toBeChecked();
  expect((await sheet.locator(".calendar-notify").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  if (!isMobile) {
    await expect(sheet.getByLabel("Reschedule day", { exact: true })).toHaveValue(dateKey(nextDay));
    await expect(sheet.getByLabel("Reschedule crew", { exact: true })).toHaveValue(other.crewId);
  }
  await sheet.getByLabel("Reschedule day", { exact: true }).fill(dateKey(nextDay));
  await sheet.getByLabel("Reschedule time", { exact: true }).fill(new Date(moved).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }));
  await sheet.getByLabel("Reschedule crew", { exact: true }).selectOption(other.crewId);
  await shot(page, "calendar-reschedule-sheet");
  await sheet.getByRole("button", { name: "Reschedule", exact: true }).click();
  await expect(sheet).toBeHidden();
  const current = async () => must(await owner.get(`/api/jobs/${job.jobId}?businessId=${B}`)).job;
  expect(await current()).toMatchObject({ assignedCrewId: other.crewId, scheduledStart: moved, crewConfirmed: true });
  expect((await outbox({ to: `other-${tag}@example.test` })).length).toBeGreaterThan(0);
  const undoBlocker = must(await owner.post("/api/jobs", { businessId: B, title: `Undo occupied ${tag}` })).job;
  must(await owner.post(`/api/jobs/${undoBlocker.jobId}/assign`, { businessId: B, crewId: crew.crewId, scheduledStart: start, scheduledEnd: start + 3600000, crewConfirmed: false, notify: false }));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /overlap|conflict|already|scheduled|booked/i })).toBeVisible();
  expect(await current()).toMatchObject({ assignedCrewId: other.crewId, scheduledStart: moved });
  must(await owner.post(`/api/jobs/${undoBlocker.jobId}/assign`, { businessId: B, crewId: null, notify: false }));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(current).toMatchObject({ assignedCrewId: crew.crewId, scheduledStart: start, crewConfirmed: true });
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
  await page.getByText(job.title, { exact: !isMobile }).filter({ visible: true }).first().click();
  page.once("dialog", (dialog) => dialog.accept());
  await sheet.getByRole("button", { name: "Unschedule", exact: true }).click();
  await expect.poll(current).toMatchObject({ assignedCrewId: null, scheduledStart: null });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(current).toMatchObject({ assignedCrewId: crew.crewId, scheduledStart: start });
  const blocked = must(await owner.post("/api/jobs", { businessId: B, title: `Occupied ${tag}` })).job;
  must(await owner.post(`/api/jobs/${blocked.jobId}/assign`, { businessId: B, crewId: other.crewId, scheduledStart: moved, scheduledEnd: moved + 3600000, crewConfirmed: false, notify: false }));
  await page.getByText(job.title, { exact: !isMobile }).filter({ visible: true }).first().click();
  await sheet.getByLabel("Reschedule day", { exact: true }).fill(dateKey(nextDay));
  await sheet.getByLabel("Reschedule time", { exact: true }).fill(new Date(moved).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }));
  await sheet.getByLabel("Reschedule crew", { exact: true }).selectOption(other.crewId);
  await sheet.getByRole("button", { name: "Reschedule", exact: true }).click();
  await expect(sheet.getByRole("alert")).toBeVisible();
  expect(await current()).toMatchObject({ assignedCrewId: crew.crewId, scheduledStart: start });
  await shot(page, "calendar-overlap-refused");
  await expectHealthy(page);
});

test("appointments industry uses the same sheet and undo without exposing Jobs", async ({ as, isMobile }) => {
  const owner = await api("dentalOwner"), B = "e2e-dental", tag = Date.now().toString(36), day = nextTuesday();
  const crew = must(await owner.post("/api/company/crews", { businessId: B, name: `Provider ${tag}` })).crew;
  const slots = must(await owner.get(`/api/company/crews/open-times?businessId=${B}&crewId=${crew.crewId}&day=${dateKey(day)}&durationMin=60`)).starts as number[];
  expect(slots.length).toBeGreaterThan(0);
  const start = slots[0], moved = slots[4], name = `Dental ${tag}`;
  const call = await simulateCall({ tenant: "dental", tools: [["bookAppointment", { businessId: B, callerName: name, callerPhone: "+15558880000", serviceType: "Cleaning", startTime: new Date(start).toISOString(), endTime: new Date(start + 3600000).toISOString() }]] });
  expect(JSON.stringify(call.toolResults)).toContain("BOOKED:");
  const appointments = must(await owner.get(`/api/businesses/${B}/appointments`)).appointments;
  const appt = appointments.find((item: { callerName: string }) => item.callerName === name);
  expect(appt).toBeTruthy();
  must(await owner.patch(`/api/appointments/${appt.appointmentId}`, { businessId: B, assignedCrewId: crew.crewId }));
  const page = await as("dentalOwner");
  await showDay(page, day, isMobile);
  await page.getByText(name, { exact: !isMobile }).filter({ visible: true }).first().click();
  const sheet = page.getByRole("dialog", { name });
  await expect(sheet.getByRole("link", { name: "Open booking", exact: true })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Open job", exact: true })).toHaveCount(0);
  await sheet.getByLabel("Reschedule time", { exact: true }).fill(new Date(moved).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }));
  await sheet.getByRole("button", { name: "Reschedule", exact: true }).click();
  await expect(sheet).toBeHidden();
  const current = async () => must(await owner.get(`/api/businesses/${B}/appointments`)).appointments.find((item: { appointmentId: string }) => item.appointmentId === appt.appointmentId);
  expect(await current()).toMatchObject({ startTime: moved, status: "requested" });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(current).toMatchObject({ startTime: start });
  await shot(page, "calendar-appointments-undo");
  await expectHealthy(page);
});
