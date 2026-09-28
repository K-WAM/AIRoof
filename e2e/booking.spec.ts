// Booking regression scenarios (G3) in the browser: the simulated phone call books real appointments through the real
// ElevenLabs webhooks (scripts/e2e/scenarios/booking.cjs), then the office sees them in the Pipeline and on the Calendar
// at the right local times. Screenshots land in test-results/screens/<desktop|phone>/.
//
// The no-browser runner is `npm run e2e:booking`; this spec reuses it so both share one truth.
import { runBookingScenarios } from "../scripts/e2e/scenarios/booking.cjs";
import { expect, expectHealthy, settle, shot, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

type Scenario = Awaited<ReturnType<typeof runBookingScenarios>>;

// Shared across the two serial tests in this file (one project at a time, workers: 1).
let scenario: Scenario | undefined;

test("booking reliability scenarios pass through the real webhooks", async () => {
  test.setTimeout(300_000);
  // keepBookings: the second test has to see the requests in the UI; it cancels them afterwards.
  scenario = await runBookingScenarios({ log: () => {}, keepBookings: true });
  expect(scenario.rows.filter((row) => !row.ok), "failed booking scenarios").toEqual([]);
  expect(scenario.ctx.s1?.callerName, "S1 booked a caller we can look up").toBeTruthy();
});

test("the booked appointment appears in the Pipeline and on the Calendar at its local time", async ({ as }) => {
  test.setTimeout(180_000);
  expect(scenario?.ctx.s1, "the scenario ran first").toBeTruthy();
  const { callerName, monday } = scenario!.ctx.s1;

  const page = await as("owner");

  // Pipeline: the request is listed with its caller.
  await page.goto("/company/pipeline");
  await settle(page);
  await page.getByRole("button", { name: /^Appointments/ }).click();
  await expect(page.getByText(callerName).first()).toBeVisible({ timeout: 15_000 });
  await shot(page, "booking-pipeline");
  await expectHealthy(page);

  // Calendar: advance to the booked week and find the tile.
  await page.goto("/company/calendar");
  await settle(page);
  const found = await findOnCalendar(page, callerName);
  expect(found, `the booking for ${monday} is on the calendar`).toBe(true);
  await shot(page, "booking-calendar");
  await expectHealthy(page);
  await expect(page.getByText(/8:00 AM/).first()).toBeVisible();

  // Clean up so the next project / a rerun starts from a free calendar.
  await scenario!.ctx.cancel?.();
});

/** Click "Next week" until the caller's tile shows up (the board opens on the current week). */
async function findOnCalendar(page: import("@playwright/test").Page, callerName: string): Promise<boolean> {
  for (let week = 0; week <= 20; week++) {
    const visible = await page
      .getByText(callerName)
      .first()
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (visible) return true;
    const next = page.getByRole("button", { name: "Next week" });
    if ((await next.count()) === 0) return false;
    await next.click();
    await settle(page, 400);
  }
  return false;
}
