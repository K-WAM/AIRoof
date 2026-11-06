// Calendar status colours + inspector / crew focus (owner, 2026-11-06). Blue = scheduled (confirmed, not started),
// amber = in progress (field notes on or after the visit's day), green = complete; unconfirmed work keeps the grey
// dashed card. Completed jobs stay on the board, locked. Inspections and crew work can be shown one at a time.
import { api, db, must } from "../scripts/e2e/lib.cjs";
import { expect, expectHealthy, settle, shot, test } from "./fixtures";

const B = "e2e-roofpros";
const HOUR = 3_600_000;

test("calendar items show blue, amber and green by progress; finished work is locked; focus splits inspections from crew work", async ({ as, isMobile }) => {
  test.setTimeout(240_000);
  const owner = await api("proOwner"), tag = Date.now().toString(36), now = Date.now();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const noon = new Date(`${today}T12:00:00-05:00`).getTime();
  const inspector = must(await owner.post("/api/company/crews", { businessId: B, name: `Insp ${tag}`, kind: "inspector", color: "#7c3aed" }), "inspector").crew;
  const crew = must(await owner.post("/api/company/crews", { businessId: B, name: `Crew ${tag}`, color: "#0f766e" }), "crew").crew;
  const place = async (title: string, start: number, opts: { confirmed?: boolean; status?: string; note?: string } = {}) => {
    const { job } = must(await owner.post("/api/jobs", { businessId: B, title, address: "1 Status Way" }), title);
    must(await owner.post(`/api/jobs/${job.jobId}/assign`, { businessId: B, crewId: crew.crewId, scheduledStart: start, scheduledEnd: start + HOUR, crewConfirmed: opts.confirmed ?? true, notify: false }), `place ${title}`);
    if (opts.status) must(await owner.patch(`/api/jobs/${job.jobId}`, { businessId: B, status: opts.status }), `status ${title}`);
    if (opts.note) must(await owner.post(`/api/jobs/${job.jobId}/updates`, { businessId: B, rawText: opts.note }), `note ${title}`);
    return job.jobId as string;
  };
  // Started a minute ago = today (or, just after midnight, yesterday): either way the note is on/after the visit day.
  const amber = await place(`Working ${tag}`, noon - 4 * HOUR, { status: "quoted", note: "Used 12 bundles of shingles. Carlos worked 8 hours." });
  const green = await place(`Finished ${tag}`, noon - 2 * HOUR, { status: "complete" });
  const blue = await place(`Booked ${tag}`, noon);
  const grey = await place(`Pencilled ${tag}`, noon + 2 * HOUR, { confirmed: false });
  const bookingId = `status-booking-${tag}`;
  await db().collection("businesses").doc(B).collection("appointments").doc(bookingId).set({ appointmentId: bookingId, businessId: B, jobId: blue, callerName: `Inspection ${tag}`, serviceType: "Roof inspection", startTime: noon, endTime: noon + 2 * HOUR, status: "confirmed", assignedCrewId: inspector.crewId, assignedBy: "office", createdAt: now });

  const page = await as("proOwner");
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 1300 });
  await page.goto("/company/calendar"); await settle(page);
  if (isMobile) {
    // The phone agenda: the colour key, and each of today's items carries its state (words + colour).
    await expect(page.getByTestId("calendar-agenda-legend")).toContainText("In progress");
    const agendaAmber = page.getByTestId(`calendar-agenda-job-${amber}`);
    await expect(agendaAmber).toHaveAttribute("data-state", "in_progress");
    await expect(page.getByTestId(`calendar-agenda-booking-${bookingId}`).getByRole("link", { name: "Open job" })).toHaveAttribute("href", `/company/jobs/${blue}`);
    const completed = page.getByTestId(`calendar-agenda-job-${green}`);
    await expect(completed.getByRole("link")).toBeVisible();
    await expect(completed.getByRole("button")).toHaveCount(0);
    await expectHealthy(page);
    await shot(page, "calendar-status-phone");
    return;
  }
  await expect(page.getByTestId("calendar-legend")).toContainText("In progress");
  await expect(page.getByTestId("calendar-legend")).toContainText("Complete");
  await expect(page.getByTestId(`calendar-job-${amber}`)).toHaveAttribute("data-state", "in_progress");
  await expect(page.getByTestId(`calendar-job-${amber}`).getByTestId("calendar-item-state")).toHaveText("In progress");
  await expect(page.getByTestId(`calendar-job-${green}`)).toHaveAttribute("data-state", "complete");
  await expect(page.getByTestId(`calendar-job-${blue}`)).toHaveAttribute("data-state", "scheduled");
  await expect(page.getByTestId(`calendar-job-${grey}`)).toHaveAttribute("data-state", "scheduled");
  // Finished work: just "Open", never Confirm / Change time / Move back.
  const finished = page.getByTestId(`calendar-job-${green}`);
  await expect(finished.getByRole("link", { name: "Open →" })).toBeVisible();
  await expect(finished.getByRole("button")).toHaveCount(0);
  // The unconfirmed one still asks to be confirmed.
  await expect(page.getByTestId(`calendar-job-${grey}`).getByRole("button", { name: /Confirm \+ email/ })).toBeVisible();
  await expect(page.getByTestId(`calendar-booking-${bookingId}`)).toHaveAttribute("data-state", "scheduled");
  await shot(page, "calendar-status-week");

  // Focus: Crew work hides inspectors and phone bookings; Inspections hides crews.
  const focus = page.getByTestId("calendar-focus");
  await focus.getByRole("button", { name: "Crew work" }).click();
  await expect(page.getByTestId("calendar-section-inspectors")).toHaveCount(0);
  await expect(page.getByTestId("calendar-bookings-row")).toHaveCount(0);
  await expect(page.getByTestId(`calendar-job-${amber}`)).toBeVisible();
  await focus.getByRole("button", { name: "Inspections" }).click();
  await expect(page.getByTestId("calendar-section-crews")).toHaveCount(0);
  await expect(page.getByTestId(`calendar-booking-${bookingId}`)).toBeVisible();
  await expect(page.getByTestId(`calendar-job-${amber}`)).toHaveCount(0);
  await shot(page, "calendar-status-inspections");
  // Remembered for the tab, then back to everything.
  await page.reload(); await settle(page);
  await expect(page.getByTestId("calendar-focus").getByRole("button", { name: "Inspections" })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("calendar-focus").getByRole("button", { name: "Everything" }).click();
  await expect(page.getByTestId("calendar-section-crews")).toBeVisible();
  await expectHealthy(page);
});
