import { test, expect, settle, shot, expectHealthy } from "./fixtures";
import { openSampleFallback } from "./demoFallback";
import { api, must, readCollection, readDoc, simulateCall } from "../scripts/e2e/lib.cjs";

test("public sample pages load, show readable records and offer no office or field writes", async ({ as }) => {
  test.setTimeout(180_000);
  const page = await as("viewer");
  await openSampleFallback(page);
  await page.getByRole("button", { name: "Open Sample App", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pipeline", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Add|New|Quick add)$/ })).toHaveCount(0);
  await expect(page.getByTestId("demo-tour")).toContainText("Your live call appears in the guided demo");
  const foreign = await page.request.get("/api/businesses/demo-roofing/calls");
  expect(foreign.status()).toBe(403);

  for (const route of ["calls", "pipeline", "calendar", "jobs", "field?jobId=J-1001", "library", "billing"]) {
    await page.goto(`/company/${route}`);
    await settle(page, 400);
    await expect(page.getByTestId("demo-tour")).toBeVisible();
    await expect(page.getByText(/Failed to load this page/)).toHaveCount(0);
    await expectHealthy(page);
    await expect(page.getByRole("button", { name: /^(Confirm|Create Job|Mark contacted|Call back|Cancel$|Decline|Send decline|Arrived office|Record a note|Add photo)/i })).toHaveCount(0);
    if (route === "calls") {
      await page.locator(".call-row").first().click();
      await page.getByRole("button", { name: "Review request", exact: true }).click();
      await expect(page.getByRole("dialog").getByRole("button", { name: /Confirm|Decline|call back/i })).toHaveCount(0);
      await shot(page, "demo-readonly-call-request");
      await page.keyboard.press("Escape");
    }
    if (route === "library") {
      await expect(page.getByRole("button", { name: /^(Edit|Remove) / })).toHaveCount(0);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(height, "sample Library should be bounded before a category is opened").toBeLessThan(4000);
    }
    if (route === "pipeline") {
      await page.getByRole("button", { name: /^Booked/ }).click();
      const card = page.locator(".appt-card").first();
      await expect(card).toBeVisible();
      await card.getByText("More", { exact: true }).click();
      await card.getByRole("button", { name: "Review details" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: /Confirm|Decline|call back/i })).toHaveCount(0);
      await shot(page, "demo-readonly-request");
      await page.keyboard.press("Escape");
    }
    if (route.startsWith("field")) {
      await expect(page.getByText(/try it, it's real/i)).toHaveCount(0);
      await expect(page.locator("textarea, input[type=file]")).toHaveCount(0);
      await expect(page.getByText(/Marco/).first()).toBeVisible();
    }
    await shot(page, `demo-sample-${route.split("?")[0]}`);
  }
  await page.goto("/company/jobs/J-1001?tab=quote");
  await expect(page.getByTestId("job-quote-empty")).toBeVisible();
  await expect(page.getByText(/Starting the quote/)).toHaveCount(0);
  await expectHealthy(page);
  await shot(page, "demo-sample-quote-empty");
});

test("a demo-line call reaches the operator app, becomes a job and shows its crew", async ({ as }, info) => {
  test.setTimeout(180_000);
  const B = "demo-roofing";
  const tag = Date.now().toString(36);
  const caller = `RoofDoctors practice ${tag}`;
  const summary = `${caller} wants a roof inspection.`;
  const admin = await api("superadmin");
  const { crew } = must(await admin.post("/api/company/crews", { businessId: B, name: `Demo crew ${tag}`, email: `${tag}@crew.e2e.test` }), "create demo crew");
  must(await admin.post("/api/company/crews", { businessId: B, name: `Demo reserve ${tag}` }), "create second booking capacity");
  const day = new Date(Date.now() + (40 + Math.floor(Math.random() * 300)) * 86400000);
  while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
  day.setUTCHours(16, 0, 0, 0);
  const call = await simulateCall({ tenant: "demo", from: "+15558880101", summary,
    transcript: [["agent", "How can I help?"], ["user", `${caller}. Please book a roof inspection.`]],
    tools: [["bookAppointment", { name: caller, email: `${tag}@customer.e2e.test`, service: "Roof inspection", address: "1 Practice St, Miami, FL", preferredTime: day.getTime() }]],
  });
  const peerName = `RoofDoctors parallel ${tag}`;
  const peerCall = await simulateCall({ tenant: "demo", from: "+15558880102", summary: `${peerName} wants a roof inspection.`,
    tools: [["bookAppointment", { name: peerName, email: `${tag}.peer@customer.e2e.test`, service: "Roof inspection", address: "2 Practice St, Miami, FL", preferredTime: day.getTime() }]],
  });
  const appointments = await readCollection(`businesses/${B}/appointments`) as Array<{ id: string; appointmentId?: string; callerName?: string }>;
  const appointment = appointments.find((a) => a.callerName === caller);
  const peer = appointments.find((a) => a.callerName === peerName);
  expect(appointment, JSON.stringify(call.toolResults)).toBeTruthy();
  expect(peer, JSON.stringify(peerCall.toolResults)).toBeTruthy();
  if (!appointment) throw new Error("The demo call did not create a booking");
  if (!peer) throw new Error("The second demo call did not reserve separate capacity");
  expect((await readDoc(`businesses/${B}/calls/${call.callId}`))?.status).toBe("ended");
  const page = await as("superadmin");
  await page.goto(`/company/calls?preview=${B}`);
  await settle(page, 400);
  await page.getByRole("button", { name: `Open call ${caller}`, exact: true }).click();
  await expect(page.getByText(`${caller}. Please book a roof inspection.`, { exact: true })).toBeVisible();
  await expectHealthy(page);
  await shot(page, "demo-live-call");

  await page.goto(`/company/pipeline?preview=${B}&appt=${appointment.appointmentId ?? appointment.id}`);
  await settle(page, 400);
  const card = page.locator(".appt-card").filter({ hasText: caller });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /^Confirm( & email)?$/ }).click();
  await expect(card.getByText("Confirmed", { exact: true })).toBeVisible();
  await shot(page, "demo-live-booking");
  await page.goto(`/company/pipeline?preview=${B}&appt=${peer.appointmentId ?? peer.id}`);
  const peerCard = page.locator(".appt-card").filter({ hasText: peerName });
  await peerCard.getByRole("button", { name: /^Confirm( & email)?$/ }).click();
  await expect(peerCard.getByText("Confirmed", { exact: true })).toBeVisible();
  await shot(page, "demo-live-parallel-booking");
  await page.goto(`/company/pipeline?preview=${B}&appt=${appointment.appointmentId ?? appointment.id}`);
  await card.getByRole("button", { name: "Create Job", exact: true }).click();
  await page.waitForURL(/\/company\/jobs\/J-\d+/);
  expect(new URL(page.url()).searchParams.get("preview")).toBe(B);
  const jobId = page.url().match(/J-\d+/)![0];
  await expect(page.getByText(/From call/)).toBeVisible();
  await expect(page.getByTestId("job-crew-line")).toContainText("No crew yet");
  await expect(page.getByRole("link", { name: "Schedule on the Calendar" })).toHaveAttribute("href", `/company/calendar?preview=${B}`);
  await shot(page, "demo-live-job");

  const workDay = new Date(Date.now() + 2 * 86400000);
  while ([0, 6].includes(workDay.getUTCDay())) workDay.setUTCDate(workDay.getUTCDate() + 1);
  const workKey = workDay.toISOString().slice(0, 10);
  const open = must(await admin.get(`/api/company/crews/open-times?businessId=${B}&crewId=${crew.crewId}&day=${workKey}&durationMin=60`), "open demo times");
  expect(open.starts.length).toBeGreaterThan(0);
  const start = open.starts[0];
  must(await admin.post(`/api/jobs/${jobId}/assign`, { businessId: B, crewId: crew.crewId, scheduledStart: start, scheduledEnd: start + 3600000, crewConfirmed: false, notify: false }), "assign demo job");
  await page.reload();
  await expect(page.getByTestId("job-crew-line")).toContainText(crew.name);
  await expect(page.getByTestId("job-crew-line")).toContainText("not confirmed");
  await expectHealthy(page);
  await shot(page, "demo-live-job-assigned");
  await page.getByTestId("job-crew-line").getByRole("link", { name: "Change" }).click();
  await expect(page).toHaveURL(new RegExp(`/company/calendar\\?preview=${B}`));
  await settle(page, 400);
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
  if (info.project.name === "phone") {
    await expect(page.getByRole("combobox", { name: "Block time for" })).toContainText(crew.name);
    const item = page.locator(".c1-agenda-item").filter({ has: page.locator(`a[href*='/jobs/${jobId}?']`) });
    for (let i = 0; i < 8 && !(await item.isVisible()); i++) {
      await page.getByRole("button", { name: "Next day" }).click();
      await settle(page, 200);
    }
    await expect(item).toContainText(crew.name);
    await item.getByRole("button", { name: "Change time", exact: true }).click();
    const picker = page.getByTestId("calendar-slot-picker");
    await expect(picker.getByRole("button").filter({ hasText: /\d:\d\d [AP]M/ }).first()).toBeVisible();
    await shot(page, "demo-live-crew-time-picker");
    await page.keyboard.press("Escape");
    await item.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(item.getByText(/· Confirmed$/)).toBeVisible();
  } else {
    await expect.poll(async () => page.locator(`[data-testid^='calendar-cell-${crew.crewId}-']`).count()).toBeGreaterThan(0);
    const cell = page.getByTestId(`calendar-cell-${crew.crewId}-${workKey}`);
    if (!(await cell.count())) await page.getByRole("button", { name: "Next week" }).click();
    await expect(cell).toContainText("1 Practice St");
    await cell.getByRole("button", { name: "✓ Confirm + email crew" }).click();
    await expect.poll(async () => (await readDoc(`businesses/${B}/jobs/${jobId}`))?.crewConfirmed).toBe(true);
  }
  await expectHealthy(page);
  await shot(page, "demo-live-calendar");
});
