// Phase 30 (T-148/T-149/T-150, 2026-09-28): editing crews and their members, the Calendar's time picker on drop
// (two jobs on one crew-day), the Team page's role help + Disable, and the field-only Crew login.
import type { Page } from "@playwright/test";
import { test, expect, settle, shot, expectHealthy } from "./fixtures";

const B = "e2e-roofing";
const stamp = () => `${Date.now().toString(36)}`;

function nextWeekTuesdayKey(): string {
  // The board starts weeks on Monday; "Next week" puts every column in the future.
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + 7);
  const tuesday = new Date(monday);
  tuesday.setDate(monday.getDate() + 1);
  return `${tuesday.getFullYear()}-${String(tuesday.getMonth() + 1).padStart(2, "0")}-${String(tuesday.getDate()).padStart(2, "0")}`;
}

/** Calls the API from inside the signed-in page, exactly like the app (its fetch carries the fresh session cookie). */
async function api(page: Page, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  if (!page.url().startsWith("http")) { await page.goto("/company/dashboard"); await settle(page); }
  return page.evaluate(async ({ method, path, body }) => {
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
  }, { method, path, body });
}

const TEST_CREW = /^(Edit|Drop|Phone|Team) Crew /;

/** Specs don't clean up after a failure, so remove this spec's own leftover crews before making new ones. */
async function clearTestCrews(page: Page) {
  const list = await api(page, "GET", `/api/company/crews?businessId=${B}`);
  for (const crew of (list.data.crews as Array<{ crewId: string; name: string }> | undefined) ?? []) {
    if (TEST_CREW.test(crew.name)) await api(page, "DELETE", `/api/company/crews?businessId=${B}&crewId=${crew.crewId}`);
  }
}

async function createCrew(page: Page, name: string): Promise<string> {
  const response = await api(page, "POST", "/api/company/crews", { businessId: B, name, email: `${name.replace(/\W+/g, "").toLowerCase()}@crew.e2e.test` });
  expect(response.ok, `create crew: ${response.status} ${JSON.stringify(response.data)}`).toBeTruthy();
  return (response.data.crew as { crewId: string }).crewId;
}

async function createJob(page: Page, title: string): Promise<string> {
  const response = await api(page, "POST", "/api/jobs", { businessId: B, title, address: "1 Test St, Miami, FL" });
  expect(response.ok, `create job: ${response.status} ${JSON.stringify(response.data)}`).toBeTruthy();
  return ((response.data.job as { jobId?: string } | undefined)?.jobId ?? response.data.jobId) as string;
}

async function dragTo(page: Page, sourceText: string, targetTestId: string) {
  const source = page.getByText(sourceText, { exact: true }).first();
  const target = page.getByTestId(targetTestId);
  // Scroll the page to the cell first, then the rail to the tile, and only then measure: measuring before a scroll
  // grabs whatever tile has moved under the old coordinates.
  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag source or target not on screen");
  await page.mouse.move(from.x + 20, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
}

test("Library: edit a crew and add a member (T-148)", async ({ as }) => {
  const page = await as("owner");
  await clearTestCrews(page);
  const name = `Edit Crew ${stamp()}`;
  const crewId = await createCrew(page, name);
  await page.goto("/company/library?section=crews");
  await settle(page);
  const card = page.getByTestId(`crew-card-${crewId}`);
  await expect(card).toBeInViewport({ ratio: 0.1 }).catch(async () => { await card.scrollIntoViewIfNeeded(); });
  await card.getByRole("button", { name: `Edit ${name}` }).click();
  await card.getByLabel("Crew name").fill(`${name} Renamed`);
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText(`${name} Renamed`, { exact: true })).toBeVisible();

  const saved = page.waitForResponse((response) => response.url().includes("/api/company/team/") && response.request().method() === "PATCH");
  await card.getByLabel(`Add a member to ${name} Renamed`).selectOption("e2e-field-crew");
  expect((await saved).ok()).toBeTruthy();
  await expect(card.getByText("Frank Field · Installer")).toBeVisible();
  await expect(page.getByTestId("crew-capacity-line")).toContainText("one per active crew");
  await expectHealthy(page);
  await shot(page, "crews-library-edit-members");

  // Clean up: taking the crew away frees Frank for the next project's run.
  const removed = await api(page, "DELETE", `/api/company/crews?businessId=${B}&crewId=${crewId}`);
  expect(removed.data).toMatchObject({ ok: true, membersCleared: 1 });
  // Frank is on no crew now, so the next project run starts clean.
});

test("Calendar: a drop asks for a time, and a second job fits the same crew-day (T-149)", async ({ as }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "drag-and-drop is covered on desktop; the phone check below uses Change time");
  const page = await as("owner");
  await page.setViewportSize({ width: 1280, height: 1300 });
  await clearTestCrews(page);
  const crewName = `Drop Crew ${stamp()}`;
  const crewId = await createCrew(page, crewName);
  const first = `First drop ${stamp()}`;
  const second = `Second drop ${stamp()}`;
  await createJob(page, first);
  await createJob(page, second);

  await page.goto("/company/calendar");
  await settle(page);
  await page.getByRole("button", { name: "Next week" }).click();
  await settle(page);
  const cell = `calendar-cell-${crewId}-${nextWeekTuesdayKey()}`;

  await dragTo(page, first, cell);
  const picker = page.getByTestId("calendar-slot-picker");
  await expect(picker).toBeVisible();
  await expect(picker.getByText(/Open times for/)).toBeVisible();
  await shot(page, "calendar-time-picker");
  const firstTime = (await picker.getByRole("button").filter({ hasText: /\d:\d\d [AP]M/ }).first().textContent())!.trim();
  await picker.getByRole("button", { name: firstTime, exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByTestId(cell).getByText(new RegExp(`^${firstTime.replace(/\s/g, "\\s")}`))).toBeVisible();

  // The owner's report: a second job on a crew-day that already has one used to be refused.
  await dragTo(page, second, cell);
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: firstTime, exact: true })).toHaveCount(0);
  const secondTime = (await picker.getByRole("button").filter({ hasText: /\d:\d\d [AP]M/ }).first().textContent())!.trim();
  await picker.getByRole("button", { name: secondTime, exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByTestId(cell).getByText(second, { exact: false })).toBeVisible();
  await expect(page.getByTestId(cell).getByText(first, { exact: false })).toBeVisible();
  await expect(page.getByTestId(cell).getByRole("button", { name: "✓ Confirm + email crew" }).first()).toBeVisible();
  await expect(page.getByTestId("calendar-bookings-row")).toContainText("Phone bookings");
  await expectHealthy(page, { allowOverflow: true });
  await shot(page, "calendar-two-jobs-one-day");

  await api(page, "DELETE", `/api/company/crews?businessId=${B}&crewId=${crewId}`);
});

test("Calendar on a phone: Change time opens the picker as a bottom sheet (T-149)", async ({ as }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone layout check");
  const page = await as("owner");
  await clearTestCrews(page);
  const crewId = await createCrew(page, `Phone Crew ${stamp()}`);
  const title = `Phone job ${stamp()}`;
  const jobId = await createJob(page, title);
  const day = nextWeekTuesdayKey();
  const openTimes = (await api(page, "GET", `/api/company/crews/open-times?businessId=${B}&crewId=${crewId}&day=${day}&durationMin=60`)).data as { starts: number[] };
  expect(openTimes.starts.length).toBeGreaterThan(0);
  const start = openTimes.starts[Math.min(10, openTimes.starts.length - 1)];
  const assigned = await api(page, "POST", `/api/jobs/${jobId}/assign`, { businessId: B, crewId, scheduledStart: start, scheduledEnd: start + 3_600_000, crewConfirmed: false, notify: false });
  expect(assigned.ok, JSON.stringify(assigned.data)).toBeTruthy();

  await page.goto("/company/calendar");
  await settle(page);
  await page.getByRole("button", { name: "Next week" }).click();
  await settle(page);
  await page.getByTestId(`calendar-cell-${crewId}-${day}`).getByRole("button", { name: "Change time", exact: true }).click();
  const picker = page.getByTestId("calendar-slot-picker");
  await expect(picker).toBeInViewport();
  const box = (await picker.boundingBox())!;
  expect(box.width).toBeGreaterThan(360); // full-width sheet, not a clipped 320 px popover
  await shot(page, "calendar-change-time-sheet");
  await api(page, "DELETE", `/api/company/crews?businessId=${B}&crewId=${crewId}`);
});

test("Team: role help, Crew option and Disable (T-150)", async ({ as }) => {
  const page = await as("owner");
  const crewId = await createCrew(page, `Team Crew ${stamp()}`);
  await page.goto("/company/team");
  await settle(page);
  await expect(page.getByText("sam@", { exact: false }).or(page.getByText("staff@roofing.e2e.test"))).toBeVisible();
  await page.getByRole("button", { name: "What each role can do" }).first().click();
  await expect(page.getByRole("dialog", { name: "What each role can do" })).toContainText("Field work only");
  await shot(page, "team-role-help");
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await expect(page.getByRole("button", { name: "Lock" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Disable" }).first()).toBeVisible();
  await expect(page.getByLabel("Crew for staff@roofing.e2e.test")).toBeAttached();
  await expectHealthy(page, { allowOverflow: true });
  await api(page, "DELETE", `/api/company/crews?businessId=${B}&crewId=${crewId}`);
});

test("A Crew login only gets the Field screen (T-150)", async ({ as }) => {
  const page = await as("fieldCrew");
  await page.goto("/company/pipeline");
  await page.waitForURL(/\/company\/field/, { timeout: 20_000 });
  await settle(page);
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click(); // phones keep the nav in the menu sheet
  const nav = page.locator('nav[aria-label="Company navigation"]:visible').first();
  await expect(nav.getByRole("link", { name: "Field" })).toBeAttached();
  await expect(nav.getByRole("link", { name: "Pipeline" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expectHealthy(page, { allowOverflow: true });
  await shot(page, "crew-login-field");
});
